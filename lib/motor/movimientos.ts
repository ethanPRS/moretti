import { Prisma, EstadoDisputa, EstadoPlan, OrigenReembolso } from "@prisma/client";
import { prisma } from "../prisma";
import { pasarela as pasarelaPorDefecto, type Pasarela } from "../pasarela";
import { ReglaError, mxc } from "./errores";
import { PasarelaError } from "./planes";
import { evaluarSuspension } from "./suspension";

/**
 * Lo que le pasa al dinero después de cobrarlo: reembolsos, disputas y la
 * comisión que confirma Stripe. R3: el pago original nunca se edita; cada
 * corrección es un registro nuevo (Reembolso, Disputa) con su evento en la
 * bitácora. La pasarela es la fuente de la verdad: lo que Stripe dice que pasó
 * se registra, y si no cuadra con la base queda una alerta.
 */

const { Decimal } = Prisma;

type ResultadoMovimiento = "registrado" | "ya_registrado" | "sin_pago";

/** Busca el pago por el cobro de la pasarela (en Stripe, el PaymentIntent). */
function pagoPorReferencia(db: Prisma.TransactionClient | typeof prisma, referenciaPasarela: string) {
  return db.pago.findFirst({
    where: { OR: [{ stripePaymentIntentId: referenciaPasarela }, { referenciaStripe: referenciaPasarela }] },
    include: { reembolsos: true, exhibicion: true },
  });
}

const concepto = (numero: number) => (numero === 0 ? "el anticipo" : `la mensualidad ${numero}`);

// ─────────────────────────────────────────────────────────────────────────
// Reembolsos
// ─────────────────────────────────────────────────────────────────────────

/**
 * Registra un reembolso hecho en la pasarela. Lo llaman `reembolsarPago`
 * (desde el back office) y el webhook `charge.refunded` (también cuando Moretti
 * reembolsa desde su propio Dashboard). La referencia es única: el segundo en
 * llegar no registra nada.
 *
 * No mueve el saldo ni el estado del plan: devolver dinero no decide si se
 * vuelve a cobrar o se cancela; eso lo decide una persona con la alerta.
 */
export async function registrarReembolso(params: {
  referenciaPasarela: string;
  referenciaReembolso: string;
  montoCentavos: number;
  origen: OrigenReembolso;
  devolvioComision?: boolean | null;
  motivo?: string | null;
  usuario?: string;
}): Promise<ResultadoMovimiento> {
  try {
    return await prisma.$transaction(async (tx) => {
      if (await tx.reembolso.findUnique({ where: { referenciaStripe: params.referenciaReembolso } })) {
        return "ya_registrado" as const;
      }
      const pago = await pagoPorReferencia(tx, params.referenciaPasarela);
      if (!pago) return "sin_pago" as const;

      const monto = new Decimal(params.montoCentavos).div(100);
      const antes = pago.reembolsos.reduce((a, r) => a.add(r.monto), new Decimal(0));
      const total = antes.add(monto);
      await tx.reembolso.create({
        data: {
          pagoId: pago.id,
          planId: pago.planId,
          monto,
          origen: params.origen,
          referenciaStripe: params.referenciaReembolso,
          devolvioComision: params.devolvioComision ?? null,
          motivo: params.motivo ?? null,
          usuario: params.usuario ?? "sistema",
        },
      });

      const quien =
        params.origen === OrigenReembolso.BACK_OFFICE
          ? `desde el back office${params.usuario ? ` (${params.usuario})` : ""}`
          : params.origen === OrigenReembolso.DASHBOARD_MORETTI
            ? "por Moretti desde su Dashboard de Stripe"
            : "porque se perdió una disputa";
      const comision =
        params.devolvioComision === true
          ? " Se le devolvió también la comisión del canal."
          : params.devolvioComision === false
            ? " La comisión del canal no se devolvió."
            : "";
      const excede = total.gt(pago.monto)
        ? ` ALERTA: lo reembolsado (${mxc(total.toNumber())}) ya pasa de lo cobrado (${mxc(Number(pago.monto))}); revisarlo en Stripe.`
        : "";
      await tx.evento.create({
        data: {
          entidadTipo: "plan",
          entidadId: pago.planId,
          tipo: "reembolso_registrado",
          usuario: params.usuario ?? "sistema",
          comentario: `Reembolso de ${mxc(monto.toNumber())} de ${concepto(pago.exhibicion.numero)} (${params.referenciaReembolso}), ${quien}.${params.motivo ? ` Motivo: ${params.motivo}.` : ""}${comision} El pago original no se tocó (R3) y el saldo del plan no se movió: decidir si se vuelve a cobrar o se cancela.${excede}`,
        },
      });
      return "registrado" as const;
    });
  } catch (err) {
    // Dos avisos del mismo reembolso al mismo tiempo: el segundo choca con el índice único.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "ya_registrado";
    throw err;
  }
}

/**
 * Reembolso pedido desde el back office. `devolverComision` es obligatorio y
 * explícito (refund_application_fee): lo define el contrato, no hay valor por
 * defecto. Sin `montoCentavos`, se reembolsa lo que quede del pago.
 */
export async function reembolsarPago(
  params: {
    pagoId: string;
    devolverComision: boolean;
    motivo: string;
    montoCentavos?: number;
    usuario?: string;
  },
  opciones: { pasarela?: Pasarela } = {}
) {
  if (typeof params.devolverComision !== "boolean") {
    throw new ReglaError("Hay que decir si se devuelve la comisión del canal (sí o no): lo define el contrato.");
  }
  const motivo = params.motivo?.trim();
  if (!motivo) throw new ReglaError("Para reembolsar hay que escribir el motivo: queda en la bitácora.");

  const pago = await prisma.pago.findUnique({
    where: { id: params.pagoId },
    include: { reembolsos: true, plan: { include: { comprador: { include: { unidad: true } } } } },
  });
  if (!pago) throw new ReglaError("No se encontró el pago.");
  if (!pago.referenciaStripe) throw new ReglaError("Ese pago no tiene referencia en la pasarela: no se puede reembolsar desde aquí.");

  const cobradoCentavos = Math.round(Number(pago.monto) * 100);
  const reembolsadoCentavos = pago.reembolsos.reduce((a, r) => a + Math.round(Number(r.monto) * 100), 0);
  const disponible = cobradoCentavos - reembolsadoCentavos;
  const montoCentavos = params.montoCentavos ?? disponible;
  if (!Number.isSafeInteger(montoCentavos) || montoCentavos <= 0) {
    throw new ReglaError("El monto a reembolsar tiene que ser mayor que cero.");
  }
  if (montoCentavos > disponible) {
    throw new ReglaError(
      `No se puede reembolsar ${mxc(montoCentavos / 100)}: de este pago quedan ${mxc(disponible / 100)} sin reembolsar.`
    );
  }

  const pasarela = opciones.pasarela ?? pasarelaPorDefecto;
  let hecho;
  try {
    hecho = await pasarela.reembolsar({
      pagoId: pago.id,
      referenciaPasarela: pago.referenciaStripe,
      proyectoId: pago.plan.comprador.unidad.proyectoId,
      // Determinista: si se cae después de reembolsar, el reintento lleva la misma llave.
      numero: pago.reembolsos.length + 1,
      montoCentavos,
      devolverComision: params.devolverComision,
    });
  } catch (err) {
    if (err instanceof ReglaError) throw err;
    throw new PasarelaError("La pasarela no respondió al reembolsar. Vuelve a intentar: no se reembolsa dos veces.", {
      cause: err,
    });
  }

  await registrarReembolso({
    referenciaPasarela: pago.referenciaStripe,
    referenciaReembolso: hecho.referenciaReembolso,
    montoCentavos: hecho.montoCentavos,
    origen: OrigenReembolso.BACK_OFFICE,
    devolvioComision: params.devolverComision,
    motivo,
    usuario: params.usuario ?? "back office",
  });
  return hecho;
}

// ─────────────────────────────────────────────────────────────────────────
// Disputas
// ─────────────────────────────────────────────────────────────────────────

/**
 * El comprador desconoció un cargo con su banco (`charge.dispute.created`).
 * Se registra la disputa y el plan queda SUSPENDIDO hasta que se cierre: el
 * barrido no le cobra nada mientras tanto.
 */
export async function registrarDisputa(params: {
  referenciaDisputa: string;
  referenciaPasarela: string;
  montoCentavos: number;
  motivo: string;
}): Promise<ResultadoMovimiento> {
  try {
    return await prisma.$transaction(async (tx) => {
      if (await tx.disputa.findUnique({ where: { stripeDisputeId: params.referenciaDisputa } })) {
        return "ya_registrado" as const;
      }
      const pago = await pagoPorReferencia(tx, params.referenciaPasarela);
      if (!pago) return "sin_pago" as const;

      const plan = await tx.plan.findUniqueOrThrow({ where: { id: pago.planId } });
      await tx.disputa.create({
        data: {
          pagoId: pago.id,
          planId: pago.planId,
          stripeDisputeId: params.referenciaDisputa,
          monto: new Decimal(params.montoCentavos).div(100),
          motivo: params.motivo,
        },
      });
      const seSuspende = plan.estado === EstadoPlan.ACTIVO || plan.estado === EstadoPlan.SUSPENDIDO;
      await tx.evento.create({
        data: {
          entidadTipo: "plan",
          entidadId: pago.planId,
          tipo: "disputa_abierta",
          comentario: `ALERTA: el comprador desconoció ${concepto(pago.exhibicion.numero)} con su banco (${params.referenciaDisputa}, ${mxc(params.montoCentavos / 100)}, motivo: ${params.motivo}). ${seSuspende ? "El plan queda suspendido y no se le cobra nada hasta que se resuelva." : `El plan está ${plan.estado.toLowerCase()}: no se suspende, pero hay que atender la disputa en Stripe.`} Moretti tiene que mandar evidencia desde su Dashboard.`,
        },
      });
      await evaluarSuspension(tx, pago.planId, "se abrió una disputa");
      return "registrado" as const;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "ya_registrado";
    throw err;
  }
}

/**
 * La disputa se cerró (`charge.dispute.closed`). Si se perdió, Stripe ya
 * retiró el dinero: se registra como reembolso por disputa perdida. El plan
 * se reactiva si ya no tiene otro motivo para estar suspendido.
 */
export async function cerrarDisputa(params: {
  referenciaDisputa: string;
  referenciaPasarela: string;
  montoCentavos: number;
  motivo: string;
  /** El estado de Stripe: won, lost, warning_closed… */
  estadoPasarela: string;
}): Promise<ResultadoMovimiento> {
  // Si el cierre llega antes que la apertura (Stripe no garantiza el orden), se abre primero.
  const apertura = await registrarDisputa(params);
  if (apertura === "sin_pago") return "sin_pago";

  const estado =
    params.estadoPasarela === "won"
      ? EstadoDisputa.GANADA
      : params.estadoPasarela === "lost"
        ? EstadoDisputa.PERDIDA
        : EstadoDisputa.CERRADA;

  const cerrada = await prisma.$transaction(async (tx) => {
    const { count } = await tx.disputa.updateMany({
      where: { stripeDisputeId: params.referenciaDisputa, estado: EstadoDisputa.ABIERTA },
      data: { estado, cerradaEn: new Date() },
    });
    if (count === 0) return false;
    const disputa = await tx.disputa.findUniqueOrThrow({ where: { stripeDisputeId: params.referenciaDisputa } });
    await tx.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: disputa.planId,
        tipo: "disputa_cerrada",
        estadoAnterior: EstadoDisputa.ABIERTA,
        estadoNuevo: estado,
        comentario:
          estado === EstadoDisputa.GANADA
            ? `Se ganó la disputa ${params.referenciaDisputa}: el dinero se queda con Moretti.`
            : estado === EstadoDisputa.PERDIDA
              ? `Se perdió la disputa ${params.referenciaDisputa}: el banco le devolvió ${mxc(params.montoCentavos / 100)} al comprador. Queda registrado como reembolso.`
              : `La disputa ${params.referenciaDisputa} se cerró (${params.estadoPasarela}).`,
      },
    });
    await evaluarSuspension(tx, disputa.planId, "se cerró la disputa");
    return true;
  });
  if (!cerrada) return "ya_registrado";

  if (estado === EstadoDisputa.PERDIDA) {
    await registrarReembolso({
      referenciaPasarela: params.referenciaPasarela,
      referenciaReembolso: params.referenciaDisputa,
      montoCentavos: params.montoCentavos,
      origen: OrigenReembolso.DISPUTA_PERDIDA,
      devolvioComision: null,
      motivo: params.motivo,
    });
  }
  return "registrado";
}

// ─────────────────────────────────────────────────────────────────────────
// La comisión que confirma Stripe
// ─────────────────────────────────────────────────────────────────────────

/**
 * Stripe creó la comisión del canal de un cobro (`application_fee.created`;
 * en cargos directos llega aparte y puede llegar antes que el pago). Se guarda
 * su id en el pago, una sola vez, y si el monto no coincide con lo registrado
 * queda una alerta: manda Stripe.
 *
 * Lanza si el pago todavía no está aplicado, para que el webhook conteste 500
 * y Stripe lo vuelva a mandar más tarde.
 */
export async function registrarComisionCobrada(params: {
  referenciaComision: string;
  referenciaPasarela: string;
  montoCentavos: number;
}): Promise<ResultadoMovimiento> {
  return prisma.$transaction(async (tx) => {
    const pago = await pagoPorReferencia(tx, params.referenciaPasarela);
    if (!pago) {
      throw new Error(`El pago de ${params.referenciaPasarela} todavía no está aplicado; Stripe reintentará.`);
    }
    if (pago.stripeApplicationFeeId) return "ya_registrado" as const;

    const { count } = await tx.pago.updateMany({
      where: { id: pago.id, stripeApplicationFeeId: null },
      data: { stripeApplicationFeeId: params.referenciaComision },
    });
    if (count === 0) return "ya_registrado" as const;

    const registrada = Math.round(Number(pago.montoComision) * 100);
    if (registrada !== params.montoCentavos) {
      await tx.evento.create({
        data: {
          entidadTipo: "plan",
          entidadId: pago.planId,
          tipo: "discrepancia_stripe",
          comentario: `ALERTA: la comisión que Stripe cobró por ${concepto(pago.exhibicion.numero)} (${params.referenciaComision}) es de ${mxc(params.montoCentavos / 100)} y en el pago se registró ${mxc(registrada / 100)}. Manda Stripe: revisar por qué no coincide.`,
        },
      });
    }
    return "registrado" as const;
  });
}
