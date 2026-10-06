import { EstadoComprobante, EstadoExhibicion, EstadoFinanciero, EstadoPlan } from "@prisma/client";
import { prisma } from "../prisma";
import { aFecha, diaEnMexico } from "./fiscal";

/**
 * El tablero de cobranza (actividad V): por proyecto, cómo va la cartera, y
 * las alertas que no hay que salir a buscar. Lee la base tal cual; no
 * escribe nada.
 *
 * «Vencida» es una exhibición viva cuya fecha ya pasó (en día de México),
 * esté marcada VENCIDA por el barrido de Charly (O) o siga PENDIENTE porque
 * el barrido todavía no corre.
 */

export type ResumenProyecto = {
  id: string;
  nombre: string;
  unidades: number;
  vendidos: number;
  apartados: number;
  alCorriente: number;
  liquidados: number;
  suspendidos: number;
  conVencidas: number;
  cobradoMes: number;
  porCobrarMes: number;
  cobrosMes: number;
  fallidosMes: number;
};

export type Alerta = {
  tipo: "vencida" | "suspendido" | "fallido" | "fiscal_vencido";
  planId: string;
  comprador: string;
  unidad: string;
  texto: string;
};

function inicioDeMes(hoy: Date) {
  const d = diaEnMexico(hoy);
  // Medianoche de México del día 1 (UTC−6 todo el año desde 2022).
  return new Date(Date.UTC(d.anio, d.mes - 1, 1, 6));
}
function inicioDeMesSiguiente(hoy: Date) {
  const d = diaEnMexico(hoy);
  return new Date(Date.UTC(d.mes === 12 ? d.anio + 1 : d.anio, d.mes === 12 ? 0 : d.mes, 1, 6));
}

export async function resumenCobranza(hoy = new Date()) {
  const desde = inicioDeMes(hoy);
  const hasta = inicioDeMesSiguiente(hoy);
  const hoyDia = aFecha(diaEnMexico(hoy));

  const [proyectos, planes, pagosMes, rechazosMes, fiscalesVencidos] = await Promise.all([
    prisma.proyecto.findMany({ include: { unidades: true }, orderBy: { nombre: "asc" } }),
    prisma.plan.findMany({
      where: { estado: { in: [EstadoPlan.ACTIVO, EstadoPlan.LIQUIDADO, EstadoPlan.COTIZADO] } },
      include: {
        comprador: { include: { unidad: true } },
        exhibiciones: { where: { estado: { in: [EstadoExhibicion.PENDIENTE, EstadoExhibicion.VENCIDA] } } },
      },
    }),
    prisma.pago.findMany({
      where: { fecha: { gte: desde, lt: hasta } },
      include: { plan: { include: { comprador: { include: { unidad: true } } } } },
    }),
    prisma.evento.findMany({
      where: { tipo: "cobro_rechazado", fecha: { gte: desde, lt: hasta } },
      orderBy: { fecha: "desc" },
    }),
    prisma.comprobanteFiscal.findMany({
      where: { estado: EstadoComprobante.PENDIENTE, fechaLimite: { lt: hoyDia } },
      select: { planId: true },
    }),
  ]);

  const planPorId = new Map(planes.map((p) => [p.id, p]));
  const etiqueta = (p: (typeof planes)[number]) => `${p.comprador.unidad.torre} ${p.comprador.unidad.numero}`;
  const vencidasDe = (p: (typeof planes)[number]) =>
    p.estado === EstadoPlan.ACTIVO ? p.exhibiciones.filter((e) => e.fechaProgramada < hoyDia) : [];

  const resumen: ResumenProyecto[] = proyectos.map((proy) => {
    const unidades = proy.unidades;
    const contar = (e: EstadoFinanciero) => unidades.filter((u) => u.estadoFinanciero === e).length;
    const planesDelProyecto = planes.filter((p) => p.comprador.unidad.proyectoId === proy.id);
    const pagos = pagosMes.filter((p) => p.plan.comprador.unidad.proyectoId === proy.id);
    const fallidos = rechazosMes.filter((r) => planPorId.get(r.entidadId)?.comprador.unidad.proyectoId === proy.id);
    const porCobrarMes = planesDelProyecto
      .filter((p) => p.estado === EstadoPlan.ACTIVO)
      .flatMap((p) => p.exhibiciones)
      .filter((e) => e.fechaProgramada < hasta)
      .reduce((a, e) => a + Number(e.monto), 0);
    return {
      id: proy.id,
      nombre: proy.nombre,
      unidades: unidades.length,
      vendidos: unidades.filter((u) => u.estadoFinanciero !== EstadoFinanciero.COTIZADO && u.estadoFinanciero !== EstadoFinanciero.CANCELADO).length,
      apartados: contar(EstadoFinanciero.APARTADO),
      alCorriente: contar(EstadoFinanciero.AL_CORRIENTE),
      liquidados: contar(EstadoFinanciero.LIQUIDADO),
      suspendidos: contar(EstadoFinanciero.SUSPENDIDO),
      conVencidas: planesDelProyecto.filter((p) => vencidasDe(p).length > 0).length,
      cobradoMes: pagos.reduce((a, p) => a + Number(p.monto), 0),
      porCobrarMes,
      cobrosMes: pagos.length,
      fallidosMes: fallidos.length,
    };
  });

  const alertas: Alerta[] = [];
  for (const p of planes) {
    const vencidas = vencidasDe(p);
    if (vencidas.length > 0) {
      const total = vencidas.reduce((a, e) => a + Number(e.monto), 0);
      alertas.push({
        tipo: "vencida",
        planId: p.id,
        comprador: p.comprador.nombre,
        unidad: etiqueta(p),
        texto: `${vencidas.length} ${vencidas.length === 1 ? "exhibición vencida" : "exhibiciones vencidas"} por $${total.toLocaleString("es-MX")}`,
      });
    }
    if (p.comprador.unidad.estadoFinanciero === EstadoFinanciero.SUSPENDIDO) {
      alertas.push({ tipo: "suspendido", planId: p.id, comprador: p.comprador.nombre, unidad: etiqueta(p), texto: "Plan suspendido" });
    }
  }
  const yaFallido = new Set<string>();
  for (const r of rechazosMes) {
    const p = planPorId.get(r.entidadId);
    if (!p || yaFallido.has(p.id)) continue;
    yaFallido.add(p.id);
    alertas.push({
      tipo: "fallido",
      planId: p.id,
      comprador: p.comprador.nombre,
      unidad: etiqueta(p),
      texto: r.comentario ?? "Cobro rechazado este mes",
    });
  }
  for (const planId of new Set(fiscalesVencidos.map((c) => c.planId))) {
    const p = planPorId.get(planId);
    if (!p) continue;
    alertas.push({ tipo: "fiscal_vencido", planId, comprador: p.comprador.nombre, unidad: etiqueta(p), texto: "Comprobante fiscal vencido" });
  }

  return { resumen, alertas, mes: desde };
}
