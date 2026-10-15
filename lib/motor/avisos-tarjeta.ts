import { EstadoExhibicion, EstadoPlan } from "@prisma/client";
import { prisma } from "../prisma";
import { cobrosAfectados, etapaTarjeta, nombreEtapa, textoTarjetaPorVencer } from "./vencimiento-tarjeta";

/**
 * Deja en la bitácora del plan un aviso por cada etapa de la tarjeta por
 * vencer (1 mes, 2 semanas, 1 semana, 3 días y, si nadie hizo nada, «ya
 * venció»). Lo corre el barrido diario después de cobrar.
 *
 * Una etapa se avisa una sola vez por tarjeta: la llave es la etapa y el
 * vencimiento (Evento.estadoNuevo = «30d 10/2026»), así que una tarjeta
 * renovada vuelve a empezar. Si el barrido no corrió unos días, se avisa la
 * etapa en la que va, no las que se saltó.
 */

export type ResultadoAvisosTarjeta = { revisados: number; avisados: number };

export async function avisarTarjetasPorVencer(ahora: Date = new Date()): Promise<ResultadoAvisosTarjeta> {
  const planes = await prisma.plan.findMany({
    where: {
      estado: { in: [EstadoPlan.ACTIVO, EstadoPlan.SUSPENDIDO] },
      comprador: { tarjetaVenceMes: { not: null }, tarjetaVenceAnio: { not: null }, tarjetaInvalida: false },
    },
    include: {
      comprador: true,
      exhibiciones: { where: { estado: { in: [EstadoExhibicion.PENDIENTE, EstadoExhibicion.VENCIDA] } } },
    },
  });

  let avisados = 0;
  for (const plan of planes) {
    const { tarjetaVenceMes: mes, tarjetaVenceAnio: anio, tarjetaDescripcion } = plan.comprador;
    if (!mes || !anio) continue;
    const etapa = etapaTarjeta(mes, anio, ahora);
    if (!etapa) continue;
    const cobrosDespues = cobrosAfectados(plan.exhibiciones, mes, anio, ahora);
    if (cobrosDespues === 0) continue;

    const llave = `${etapa === "vencida" ? "vencida" : `${etapa}d`} ${mes}/${anio}`;
    const creado = await prisma.$transaction(async (tx) => {
      // Dos barridos a la vez: el candado por plan hace que sólo uno escriba el aviso.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`aviso_tarjeta:${plan.id}`}))`;
      const previo = await tx.evento.findFirst({
        where: { entidadTipo: "plan", entidadId: plan.id, tipo: "tarjeta_por_vencer", estadoNuevo: llave },
      });
      if (previo) return false;
      await tx.evento.create({
        data: {
          entidadTipo: "plan",
          entidadId: plan.id,
          tipo: "tarjeta_por_vencer",
          estadoNuevo: llave,
          comentario: `Tarjeta por vencer (${nombreEtapa(etapa)}): ${textoTarjetaPorVencer({ descripcion: tarjetaDescripcion, mes, anio, hoy: ahora, cobrosDespues })}`,
        },
      });
      return true;
    });
    if (creado) avisados++;
  }
  return { revisados: planes.length, avisados };
}
