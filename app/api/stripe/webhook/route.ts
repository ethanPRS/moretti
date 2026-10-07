import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { OrigenReembolso, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  actualizarTarjetaDelBanco,
  aplicarCobroConfirmado,
  guardarTarjeta,
  registrarAutorizacion,
  registrarCobroRechazado,
} from "@/lib/motor/planes";
import { cerrarDisputa, registrarComisionCobrada, registrarDisputa, registrarReembolso } from "@/lib/motor/movimientos";
import { describirTarjeta } from "@/lib/pasarela/stripe-respuestas";

/**
 * Webhook de Stripe (S1-10). Un solo endpoint; los eventos llegan de dos lados
 * (la lista completa, para configurar los destinos, en docs/integracion-stripe.md):
 *
 * - La plataforma (sin `event.account`), firmados con STRIPE_WEBHOOK_SECRET:
 *   setup_intent.succeeded, payment_method.automatically_updated,
 *   application_fee.created. La tarjeta vive en la plataforma (D-02) y la
 *   comisión le llega a la plataforma.
 * - Las cuentas de Moretti (`event.account = acct_…`), firmados con
 *   STRIPE_WEBHOOK_SECRET_CONNECT: todo lo del cobro, porque son cargos
 *   directos. payment_intent.succeeded, payment_intent.payment_failed,
 *   payment_intent.amount_capturable_updated, payment_intent.canceled,
 *   charge.refunded, charge.dispute.created, charge.dispute.closed.
 *
 * Con `stripe listen` local es una sola firma para los dos.
 *
 * Un mismo evento no se procesa dos veces (EventoStripe.stripeEventId es
 * único) y, además, cada cosa que hace el motor es idempotente. Los tipos que
 * no se manejan contestan 200 y quedan en el log, para que Stripe no los
 * reintente. El webhook no repite lógica de negocio: llama al motor.
 */

const secretos = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET_CONNECT].filter(
  (s): s is string => Boolean(s)
);

/** El stripeAccountId de EventoStripe para lo que viene de la plataforma. */
const PLATAFORMA = "plataforma";

export async function POST(request: NextRequest) {
  const llave = process.env.STRIPE_SECRET_KEY;
  if (!llave?.startsWith("sk_test_") || secretos.length === 0) {
    return NextResponse.json({ error: "Webhook de Stripe sin configurar (modo prueba)." }, { status: 500 });
  }

  const firma = request.headers.get("stripe-signature");
  if (!firma) return NextResponse.json({ error: "Falta la firma de Stripe." }, { status: 400 });

  // La firma se verifica sobre el cuerpo crudo, antes de interpretarlo.
  const crudo = await request.text();
  const api = new Stripe(llave);
  const event = verificar(api, crudo, firma);
  if (!event) return NextResponse.json({ error: "Firma de Stripe inválida." }, { status: 400 });
  if (event.livemode) {
    return NextResponse.json({ error: "Este prototipo sólo acepta eventos de modo prueba." }, { status: 400 });
  }

  const cuenta = event.account ?? null;

  // Deduplicar por id de evento. Dos entregas simultáneas: la segunda choca
  // con el índice único y se trata como reenvío, no como error.
  try {
    await prisma.eventoStripe.create({
      data: {
        stripeEventId: event.id,
        stripeAccountId: cuenta ?? PLATAFORMA,
        tipo: event.type,
        payload: JSON.parse(crudo),
      },
    });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
    const previo = await prisma.eventoStripe.findUnique({ where: { stripeEventId: event.id } });
    if (previo?.procesado) return NextResponse.json({ received: true, duplicate: true });
    // Un intento anterior falló: se vuelve a procesar.
  }

  try {
    const nota = await procesar(api, event, cuenta);
    if (nota) console.info(`Webhook de Stripe: ${event.id} (${event.type}) sin aplicar: ${nota}.`);
    await prisma.eventoStripe.update({
      where: { stripeEventId: event.id },
      data: { procesado: true, procesadoEn: new Date(), error: nota },
    });
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`Webhook de Stripe: no se pudo procesar ${event.id} (${event.type}).`, err);
    await prisma.eventoStripe.update({
      where: { stripeEventId: event.id },
      data: { error: err instanceof Error ? err.message : "No se pudo procesar el evento." },
    });
    // 500: Stripe lo vuelve a mandar. El motor aguanta la repetición.
    return NextResponse.json({ error: "No se pudo procesar el evento." }, { status: 500 });
  }
}

function verificar(api: Stripe, crudo: string, firma: string): Stripe.Event | null {
  for (const secreto of secretos) {
    try {
      return api.webhooks.constructEvent(crudo, firma, secreto);
    } catch {
      // Con la otra firma, si hay.
    }
  }
  return null;
}

const idDe = (x: string | { id: string } | null | undefined) => (typeof x === "string" ? x : x?.id ?? null);

/**
 * Aplica el evento. Devuelve una nota si lo ignoró a propósito (queda en
 * EventoStripe.error con procesado = true y en el log); lanza si algo falló de
 * verdad, para que Stripe lo reintente.
 */
async function procesar(api: Stripe, event: Stripe.Event, cuenta: string | null): Promise<string | null> {
  switch (event.type) {
    // ── Cuentas de Moretti: el ciclo del cobro ───────────────────────────
    case "payment_intent.succeeded": {
      const pi = event.data.object;
      const cobro = await cobroDelEvento(pi, cuenta);
      if (typeof cobro === "string") return cobro;
      // Lo que Stripe cobró de verdad: si no coincide con la base, manda Stripe y queda alerta.
      const r = await aplicarCobroConfirmado({
        exhibicionId: cobro.exhibicionId,
        referenciaPasarela: pi.id,
        montoCentavos: pi.amount_received || pi.amount,
        comisionCentavos: pi.application_fee_amount,
      });
      return r === "aplicado" ? null : `ya estaba aplicado (${r})`;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      const cobro = await cobroDelEvento(pi, cuenta);
      if (typeof cobro === "string") return cobro;
      const e = pi.last_payment_error as (Stripe.PaymentIntent.LastPaymentError & { advice_code?: string }) | null;
      // Casi siempre la respuesta de `cobrar` ya lo anotó; esto cubre cuando no llegó.
      const anotado = await registrarCobroRechazado({
        exhibicionId: cobro.exhibicionId,
        intento: cobro.intento,
        codigo: e?.decline_code ?? e?.code ?? "card_declined",
        consejo: e?.advice_code ?? null,
      });
      return anotado ? null : "el rechazo ya estaba anotado";
    }

    case "payment_intent.amount_capturable_updated": {
      // Sólo con STRIPE_CAPTURE_METHOD=manual: el anticipo quedó autorizado, no cobrado.
      const pi = event.data.object;
      const cobro = await cobroDelEvento(pi, cuenta);
      if (typeof cobro === "string") return cobro;
      const anotado = await registrarAutorizacion({
        exhibicionId: cobro.exhibicionId,
        referenciaPasarela: pi.id,
        montoCentavos: pi.amount_capturable,
      });
      return anotado ? null : "la exhibición ya estaba pagada";
    }

    case "payment_intent.canceled": {
      // Se liberó una autorización (o se canceló un cobro sin terminar): el intento se cierra.
      const pi = event.data.object;
      const cobro = await cobroDelEvento(pi, cuenta);
      if (typeof cobro === "string") return cobro;
      const anotado = await registrarCobroRechazado({
        exhibicionId: cobro.exhibicionId,
        intento: cobro.intento,
        codigo: "autorizacion_liberada",
      });
      return anotado ? null : "la cancelación ya estaba anotada";
    }

    case "charge.refunded": {
      if (!cuenta) return "reembolso de la plataforma: los cobros viven en la cuenta de Moretti";
      const charge = event.data.object;
      const pi = idDe(charge.payment_intent);
      if (!pi) return "cargo sin PaymentIntent: no es de día uno";
      // Moretti pudo reembolsar desde su Dashboard: se leen todos los reembolsos del cargo
      // y se registra cada uno una sola vez (la referencia re_… es única).
      const reembolsos = await api.refunds.list({ charge: charge.id, limit: 100 }, { stripeAccount: cuenta });
      const notas: string[] = [];
      for (const refund of reembolsos.data) {
        if (refund.status !== "succeeded" && refund.status !== "pending") continue;
        const nuestro = Boolean(refund.metadata?.pagoId);
        const r = await registrarReembolso({
          referenciaPasarela: pi,
          referenciaReembolso: refund.id,
          montoCentavos: refund.amount,
          origen: nuestro ? OrigenReembolso.BACK_OFFICE : OrigenReembolso.DASHBOARD_MORETTI,
          devolvioComision: null,
          motivo: refund.reason ?? null,
          usuario: nuestro ? "back office" : "Moretti (Dashboard de Stripe)",
        });
        if (r === "sin_pago") return `el cobro ${pi} no está registrado en esta base`;
        if (r === "ya_registrado") notas.push(refund.id);
      }
      return notas.length === reembolsos.data.length && notas.length > 0
        ? `reembolsos ya registrados: ${notas.join(", ")}`
        : null;
    }

    case "charge.dispute.created":
    case "charge.dispute.closed": {
      if (!cuenta) return "disputa de la plataforma: los cobros viven en la cuenta de Moretti";
      const disputa = event.data.object;
      const pi = idDe(disputa.payment_intent);
      if (!pi) return "disputa sin PaymentIntent: no es de día uno";
      const datos = {
        referenciaDisputa: disputa.id,
        referenciaPasarela: pi,
        montoCentavos: disputa.amount,
        motivo: disputa.reason,
      };
      const r =
        event.type === "charge.dispute.created"
          ? await registrarDisputa(datos)
          : await cerrarDisputa({ ...datos, estadoPasarela: disputa.status });
      if (r === "sin_pago") return `el cobro ${pi} no está registrado en esta base`;
      return r === "registrado" ? null : "la disputa ya estaba registrada";
    }

    // ── Plataforma ───────────────────────────────────────────────────────
    case "setup_intent.succeeded": {
      if (cuenta) return "SetupIntent de una cuenta conectada: la tarjeta vive en la plataforma (D-02)";
      const si = event.data.object;
      const compradorId = si.metadata?.compradorId;
      const pmId = idDe(si.payment_method);
      if (!compradorId || !pmId) return "SetupIntent sin comprador o sin método de pago: no es de día uno";
      const pm = await api.paymentMethods.retrieve(pmId);
      const guardada = await guardarTarjeta({
        compradorId,
        referenciaTarjeta: pmId,
        descripcion: describirTarjeta(pm.card),
        venceMes: pm.card?.exp_month,
        venceAnio: pm.card?.exp_year,
      });
      return guardada ? null : "la tarjeta ya estaba registrada";
    }

    case "payment_method.automatically_updated": {
      if (cuenta) return "método de pago de una cuenta conectada: es un clon; la tarjeta vive en la plataforma";
      const pm = event.data.object;
      const actualizada = await actualizarTarjetaDelBanco({
        referenciaTarjeta: pm.id,
        descripcion: describirTarjeta(pm.card),
        venceMes: pm.card?.exp_month,
        venceAnio: pm.card?.exp_year,
      });
      return actualizada ? null : "ningún comprador tiene esa tarjeta";
    }

    case "application_fee.created": {
      if (cuenta) return "application_fee de una cuenta conectada: la comisión le llega a la plataforma";
      const fee = event.data.object;
      const cargo = idDe(fee.charge);
      const cuentaDelCargo = idDe(fee.account);
      if (!cargo || !cuentaDelCargo) return "comisión sin cargo o sin cuenta";
      // En cargos directos el cargo vive en la cuenta de Moretti.
      const charge = await api.charges.retrieve(
        cargo,
        { expand: ["payment_intent"] },
        { stripeAccount: cuentaDelCargo }
      );
      const pi = typeof charge.payment_intent === "object" ? charge.payment_intent : null;
      if (!pi?.metadata?.exhibicionId) return "la comisión es de un cobro que no creó el motor";
      const r = await registrarComisionCobrada({
        referenciaComision: fee.id,
        referenciaPasarela: pi.id,
        montoCentavos: fee.amount,
      });
      return r === "registrado" ? null : "la comisión ya estaba registrada";
    }

    default:
      return `tipo ${event.type} sin manejar`;
  }
}

/**
 * Lee de la metadata a qué exhibición e intento va el evento, y verifica que
 * venga de la cuenta de Moretti de ese proyecto: si no cuadra, se ignora.
 */
async function cobroDelEvento(
  pi: Stripe.PaymentIntent,
  cuenta: string | null
): Promise<{ exhibicionId: string; intento: number } | string> {
  const exhibicionId = pi.metadata?.exhibicionId;
  const intento = Number(pi.metadata?.intento);
  if (!exhibicionId || !Number.isInteger(intento) || intento < 1) {
    return "PaymentIntent sin exhibición o intento en la metadata: no lo creó el motor";
  }
  const exhibicion = await prisma.exhibicion.findUnique({
    where: { id: exhibicionId },
    select: { plan: { select: { comprador: { select: { unidad: { select: { proyecto: true } } } } } } },
  });
  if (!exhibicion) return `la exhibición ${exhibicionId} no existe en esta base`;
  const esperada = exhibicion.plan.comprador.unidad.proyecto.stripeConnectedAccountId;
  if (!cuenta || cuenta !== esperada) {
    return `el evento viene de ${cuenta ?? "la plataforma"} y el proyecto cobra en ${esperada ?? "ninguna cuenta"}`;
  }
  return { exhibicionId, intento };
}
