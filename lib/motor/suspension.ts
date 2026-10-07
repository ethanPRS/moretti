import { Prisma, EstadoDisputa, EstadoExhibicion, EstadoPlan } from "@prisma/client";

/**
 * Cuándo un plan está SUSPENDIDO. Hay dos motivos y basta uno:
 *
 * - Tiene N exhibiciones vencidas o más (hoy dos; COBRANZA_VENCIDAS_SUSPENDEN,
 *   lo fija el contrato).
 * - Tiene una disputa abierta (charge.dispute.created).
 *
 * Se recalcula después de cada cosa que puede cambiarlo —un rechazo, un pago,
 * una disputa que se abre o se cierra— y el plan vuelve a ACTIVO solo cuando
 * ya no queda ningún motivo. Sólo se mueven planes ACTIVO o SUSPENDIDO: uno
 * liquidado o cancelado no se toca (una disputa sobre él deja alerta, aparte).
 *
 * Un plan suspendido se sigue cobrando por vencidas (cobrar es justo lo que lo
 * reactiva); por disputa, no: el barrido lo salta hasta que se resuelva.
 */

export function vencidasQueSuspenden(env: Record<string, string | undefined> = process.env): number {
  const valor = env.COBRANZA_VENCIDAS_SUSPENDEN?.trim();
  const n = valor ? Number(valor) : 2;
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`COBRANZA_VENCIDAS_SUSPENDEN tiene que ser un entero de 1 en adelante; llegó «${valor}».`);
  }
  return n;
}

export async function evaluarSuspension(tx: Prisma.TransactionClient, planId: string, porque: string) {
  const plan = await tx.plan.findUniqueOrThrow({ where: { id: planId }, select: { estado: true } });
  if (plan.estado !== EstadoPlan.ACTIVO && plan.estado !== EstadoPlan.SUSPENDIDO) return;

  const [vencidas, disputas] = await Promise.all([
    tx.exhibicion.count({ where: { planId, estado: EstadoExhibicion.VENCIDA } }),
    tx.disputa.count({ where: { planId, estado: EstadoDisputa.ABIERTA } }),
  ]);
  const umbral = vencidasQueSuspenden();
  const motivos = [
    ...(vencidas >= umbral ? [`${vencidas} exhibiciones vencidas (suspende a partir de ${umbral})`] : []),
    ...(disputas > 0 ? [disputas === 1 ? "una disputa abierta" : `${disputas} disputas abiertas`] : []),
  ];
  const debe = motivos.length > 0 ? EstadoPlan.SUSPENDIDO : EstadoPlan.ACTIVO;
  if (debe === plan.estado) return;

  // Condicionado al estado leído: si otra operación ya lo movió, no se pisa.
  const { count } = await tx.plan.updateMany({ where: { id: planId, estado: plan.estado }, data: { estado: debe } });
  if (count === 0) return;
  await tx.evento.create({
    data: {
      entidadTipo: "plan",
      entidadId: planId,
      tipo: debe === EstadoPlan.SUSPENDIDO ? "plan_suspendido" : "plan_reactivado",
      estadoAnterior: plan.estado,
      estadoNuevo: debe,
      comentario:
        debe === EstadoPlan.SUSPENDIDO
          ? `Plan suspendido porque ${porque}: ${motivos.join(" y ")}.`
          : `Plan reactivado porque ${porque}: ya no tiene vencidas que lo suspendan ni disputas abiertas.`,
    },
  });
}
