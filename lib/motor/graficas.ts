import { EstadoExhibicion, EstadoPlan, EstadoTransferencia } from "@prisma/client";
import { prisma } from "../prisma";

/**
 * Datos de las gráficas del inicio del back office (retro del Sprint 2:
 * «agregar gráficas para que sea más intuitivo»). Sólo lee; las pantallas
 * dibujan. Montos en pesos.
 */

export type Mes = { clave: string; etiqueta: string; cobrado: number; pagos: number };
export type Cartera = { cobrado: number; alCorriente: number; vencido: number };
export type DineroMoretti = { proyecto: string; transferido: number; retenido: number };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Los últimos `n` meses (hora de México), con lo cobrado en cada uno; los vacíos en cero. */
export function agruparPorMes(pagos: { fecha: Date; monto: number }[], hoy: Date, n = 6): Mes[] {
  const mx = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
  const base = mx(hoy);
  const meses: Mes[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    meses.push({
      clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      etiqueta: MESES[d.getMonth()],
      cobrado: 0,
      pagos: 0,
    });
  }
  for (const p of pagos) {
    const d = mx(p.fecha);
    const m = meses.find((x) => x.clave === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    if (m) {
      m.cobrado = Math.round((m.cobrado + p.monto) * 100) / 100;
      m.pagos++;
    }
  }
  return meses;
}

export async function datosGraficas(hoy = new Date()) {
  const [pagos, exhibiciones, proyectos] = await Promise.all([
    prisma.pago.findMany({
      where: { estado: { in: ["CONFIRMADO", "AJUSTADO"] } },
      select: {
        fecha: true,
        monto: true,
        montoComision: true,
        transferencia: { select: { estado: true } },
        plan: { select: { comprador: { select: { unidad: { select: { proyectoId: true } } } } } },
      },
    }),
    // Sólo las vigentes de planes vivos: las reemplazadas y canceladas son historia (R4).
    prisma.exhibicion.findMany({
      where: {
        estado: { in: [EstadoExhibicion.PAGADA, EstadoExhibicion.PENDIENTE, EstadoExhibicion.VENCIDA] },
        plan: { estado: { in: [EstadoPlan.ACTIVO, EstadoPlan.SUSPENDIDO, EstadoPlan.LIQUIDADO] } },
      },
      select: { estado: true, monto: true },
    }),
    prisma.proyecto.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);

  const porMes = agruparPorMes(
    pagos.map((p) => ({ fecha: p.fecha, monto: Number(p.monto) })),
    hoy
  );

  const suma = (e: EstadoExhibicion) =>
    exhibiciones.filter((x) => x.estado === e).reduce((a, x) => a + Number(x.monto), 0);
  const cartera: Cartera = {
    cobrado: suma(EstadoExhibicion.PAGADA),
    alCorriente: suma(EstadoExhibicion.PENDIENTE),
    vencido: suma(EstadoExhibicion.VENCIDA),
  };

  // D-34: lo que es de Moretti (cobrado − comisión), transferido o todavía retenido.
  const moretti: DineroMoretti[] = proyectos
    .map((pr) => {
      const suyos = pagos.filter((p) => p.plan.comprador.unidad.proyectoId === pr.id);
      const neto = (p: (typeof suyos)[number]) => Number(p.monto) - Number(p.montoComision);
      const enviado = (p: (typeof suyos)[number]) => p.transferencia?.estado === EstadoTransferencia.ENVIADA;
      return {
        proyecto: pr.nombre,
        transferido: suyos.filter(enviado).reduce((a, p) => a + neto(p), 0),
        retenido: suyos.filter((p) => !enviado(p)).reduce((a, p) => a + neto(p), 0),
      };
    })
    .filter((x) => x.transferido + x.retenido > 0);

  return { porMes, cartera, moretti };
}
