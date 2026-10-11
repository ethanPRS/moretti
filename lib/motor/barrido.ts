import { Prisma, EstadoDisputa, EstadoExhibicion, EstadoPlan } from "@prisma/client";
import { prisma } from "../prisma";
import type { Pasarela } from "../pasarela";
import { cobrarExhibicion, marcarVencida, PasarelaError, ReglaError } from "./planes";

/**
 * El barrido de la cobranza: cobra fuera de sesión las mensualidades que ya
 * llegaron a su fecha y no se han pagado. Lo dispara un cron (la ruta
 * /api/cobranza/barrido o `npm run cobranza:barrido`).
 *
 * No cobra dos veces, aunque corran dos barridos a la vez o alguien pique
 * «Cobrar» en el back office al mismo tiempo:
 * - Cada exhibición se toma con una actualización condicionada (el candado
 *   `bloqueadaHasta`): de dos barridos simultáneos, sólo uno la gana.
 * - La condición para tomarla es la misma que para elegirla, así que una que
 *   otro barrido acaba de cobrar o de rechazar ya no se toma.
 * - No toca las que tienen un cobro pendiente (el banco lo procesa): eso lo
 *   resuelve el webhook.
 * - Y si aun así se cruzan dos cobros del mismo intento, llevan la misma llave
 *   de idempotencia: Stripe devuelve el mismo cargo y el motor aplica el pago
 *   una sola vez.
 *
 * Después de un rechazo, cuándo se vuelve a intentar lo decide el motor por
 * código (rechazos.ts, reintentos.ts): el barrido sólo respeta
 * `proximoIntentoEn`, `requiereTarjetaNueva` y la tarjeta inválida del comprador.
 *
 * Un plan SUSPENDIDO por vencidas se sigue cobrando: cobrar es lo que lo
 * reactiva. Uno con una disputa abierta, no.
 */

/** Un barrido que se cae a la mitad libera sus exhibiciones después de esto. */
const CANDADO_MS = 10 * 60 * 1000;
/** Un cobro pendiente más viejo que esto se reporta para revisarlo en Stripe. */
const PENDIENTE_VIEJO_MS = 48 * 60 * 60 * 1000;

export type ResultadoBarrido = {
  revisadas: number;
  cobradas: number;
  pendientes: number;
  rechazadas: number;
  /** Las tomó otro barrido entre que se eligieron y se tomaron. */
  omitidas: number;
  errores: { exhibicionId: string; planId: string; numero: number; mensaje: string }[];
  /** Cobros pendientes que el webhook no ha resuelto en 48 horas. */
  pendientesSinConfirmar: { exhibicionId: string; planId: string; numero: number; desde: Date }[];
};

/** Las que se cobran hoy. Es también la condición para tomarlas. */
function cobrables(ahora: Date): Prisma.ExhibicionWhereInput {
  return {
    numero: { gt: 0 },
    estado: { in: [EstadoExhibicion.PENDIENTE, EstadoExhibicion.VENCIDA] },
    fechaProgramada: { lte: ahora },
    requiereTarjetaNueva: false,
    cobroPendienteDesde: null,
    OR: [{ proximoIntentoEn: null }, { proximoIntentoEn: { lte: ahora } }],
    plan: {
      estado: { in: [EstadoPlan.ACTIVO, EstadoPlan.SUSPENDIDO] },
      fechaCongelamiento: { not: null },
      disputas: { none: { estado: EstadoDisputa.ABIERTA } },
      comprador: { tarjetaInvalida: false },
    },
  };
}

export async function cobrarVencidas(
  opciones: { ahora?: Date; limite?: number; pasarela?: Pasarela } = {}
): Promise<ResultadoBarrido> {
  const ahora = opciones.ahora ?? new Date();
  const resultado: ResultadoBarrido = {
    revisadas: 0,
    cobradas: 0,
    pendientes: 0,
    rechazadas: 0,
    omitidas: 0,
    errores: [],
    pendientesSinConfirmar: [],
  };

  const candidatas = await prisma.exhibicion.findMany({
    where: { AND: [libre(ahora), cobrables(ahora)] },
    orderBy: [{ fechaProgramada: "asc" }, { numero: "asc" }],
    take: opciones.limite ?? 200,
    select: { id: true, planId: true, numero: true },
  });

  for (const ex of candidatas) {
    resultado.revisadas++;
    const { count } = await prisma.exhibicion.updateMany({
      where: { id: ex.id, AND: [libre(ahora), cobrables(ahora)] },
      data: { bloqueadaHasta: new Date(ahora.getTime() + CANDADO_MS) },
    });
    if (count === 0) {
      resultado.omitidas++;
      continue;
    }

    try {
      const r = await cobrarExhibicion(ex.id, { pasarela: opciones.pasarela });
      if (r.estado === "exitoso") resultado.cobradas++;
      else if (r.estado === "pendiente") resultado.pendientes++;
      else resultado.rechazadas++;
    } catch (err) {
      // Una regla (sin tarjeta, sin cuenta de Moretti) o la pasarela caída: no
      // se cobró. Se reporta y el siguiente barrido lo vuelve a intentar.
      if (!(err instanceof ReglaError) && !(err instanceof PasarelaError)) throw err;
      resultado.errores.push({ exhibicionId: ex.id, planId: ex.planId, numero: ex.numero, mensaje: err.message });
      await marcarVencida({ exhibicionId: ex.id, ahora, porque: err.message });
    } finally {
      await prisma.exhibicion.update({ where: { id: ex.id }, data: { bloqueadaHasta: null } });
    }
  }

  const viejas = await prisma.exhibicion.findMany({
    where: {
      estado: { not: EstadoExhibicion.PAGADA },
      cobroPendienteDesde: { lte: new Date(ahora.getTime() - PENDIENTE_VIEJO_MS) },
    },
    select: { id: true, planId: true, numero: true, cobroPendienteDesde: true },
  });
  resultado.pendientesSinConfirmar = viejas.map((e) => ({
    exhibicionId: e.id,
    planId: e.planId,
    numero: e.numero,
    desde: e.cobroPendienteDesde!,
  }));

  return resultado;
}

function libre(ahora: Date): Prisma.ExhibicionWhereInput {
  return { OR: [{ bloqueadaHasta: null }, { bloqueadaHasta: { lt: ahora } }] };
}
