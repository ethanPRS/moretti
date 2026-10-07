import Stripe from "stripe";
import { prisma } from "../prisma";
import { ReglaError } from "../motor/errores";
import {
  llaveIdempotencia,
  llaveReembolso,
  type Pasarela,
  type PreparacionTarjeta,
  type ReembolsoHecho,
  type ResultadoCobro,
  type SolicitudAutorizacion,
  type SolicitudCobro,
  type SolicitudConfirmarTarjeta,
  type SolicitudReembolso,
  type SolicitudTarjeta,
  type TarjetaConfirmada,
} from "./contrato";
import { describirTarjeta, interpretarErrorStripe, interpretarPaymentIntent } from "./stripe-respuestas";

/**
 * La pasarela real (S1-06, S1-07, S1-09). Implementa ./contrato.ts v2.1.
 *
 * - Dónde vive la tarjeta: D-02, variante provisional. Se guarda en la
 *   plataforma (SetupIntent `off_session`) y al cobrar se clona a la cuenta
 *   de Moretti del proyecto para el cargo directo. Si Ana Cris decide
 *   «Moretti», se guarda directo en la cuenta conectada y se deja de clonar;
 *   el motor no cambia.
 * - Cargo directo en la cuenta conectada (`Stripe-Account`) con
 *   `application_fee_amount = comisionCentavos`. Los montos ya llegan en
 *   centavos enteros: no se multiplica nada.
 * - La llave es `llaveIdempotencia(solicitud)`. Stripe recuerda también los
 *   rechazos, por eso el intento va en la llave.
 * - Sólo modo prueba: sin `sk_test_` no se inicializa.
 * - Se clona un método de pago nuevo en cada cobro (un clon es un objeto
 *   independiente en la cuenta de Moretti y no se reutiliza). Si el mismo
 *   intento se manda dos veces, la llave devuelve el mismo clon: es el mismo cobro.
 * - capture_method del anticipo: STRIPE_CAPTURE_METHOD (automatic | manual).
 *   Decisión legal pendiente; por defecto automatic. Las mensualidades siempre
 *   se capturan al momento: fuera de sesión no hay a quién pedirle nada.
 *
 * Pendiente fuera del alcance del prototipo: SPEI. Hoy sólo `card`
 * (payment_method_types). SPEI en México va con `customer_balance` /
 * transferencia bancaria y no admite cargos fuera de sesión: necesitaría su
 * propio flujo de conciliación.
 */

export type MetodoCaptura = "automatic" | "manual";

export function metodoCaptura(env: Record<string, string | undefined> = process.env): MetodoCaptura {
  const valor = (env.STRIPE_CAPTURE_METHOD ?? "automatic").trim();
  if (valor !== "automatic" && valor !== "manual") {
    throw new Error(`STRIPE_CAPTURE_METHOD tiene que ser «automatic» o «manual»; llegó «${valor}».`);
  }
  return valor;
}

let cliente: Stripe | null = null;

function stripe(): Stripe {
  const llave = process.env.STRIPE_SECRET_KEY;
  if (!llave?.startsWith("sk_test_")) {
    throw new ReglaError("Stripe no está configurado: falta una llave secreta de prueba (sk_test_).");
  }
  cliente ??= new Stripe(llave);
  return cliente;
}

async function cuentaDelProyecto(proyectoId: string): Promise<string> {
  const proyecto = await prisma.proyecto.findUnique({
    where: { id: proyectoId },
    select: { nombre: true, stripeConnectedAccountId: true },
  });
  if (!proyecto) throw new ReglaError("No se encontró el proyecto del cobro.");
  if (!proyecto.stripeConnectedAccountId) {
    throw new ReglaError(
      `El proyecto ${proyecto.nombre} no tiene la cuenta de Stripe de Moretti. Captúrala (acct_…) en Datos del proyecto antes de cobrar.`
    );
  }
  return proyecto.stripeConnectedAccountId;
}

const concepto = (n: number) => (n === 0 ? "Anticipo" : `Mensualidad ${n}`);

export const pasarelaStripe: Pasarela = {
  async cobrar(s: SolicitudCobro): Promise<ResultadoCobro> {
    const cuenta = await cuentaDelProyecto(s.proyectoId);
    const comprador = await prisma.comprador.findUnique({
      where: { id: s.compradorId },
      select: { stripeCustomerId: true, stripePaymentMethodId: true },
    });
    if (!comprador?.stripeCustomerId || !comprador.stripePaymentMethodId) {
      throw new ReglaError(
        "El comprador todavía no registra su tarjeta. Primero se guarda la tarjeta con su autorización; después se cobra."
      );
    }

    const api = stripe();
    const llave = llaveIdempotencia(s);
    try {
      // D-02: la tarjeta vive en la plataforma; el cargo, en la cuenta de Moretti.
      // La llave del clon lleva la tarjeta: si el comprador la cambia, es otro clon.
      const clon = await api.paymentMethods.create(
        { customer: comprador.stripeCustomerId, payment_method: comprador.stripePaymentMethodId },
        { stripeAccount: cuenta, idempotencyKey: `${llave}:clon:${comprador.stripePaymentMethodId}` }
      );

      const pi = await api.paymentIntents.create(
        {
          amount: s.montoCentavos,
          currency: "mxn",
          payment_method_types: ["card"],
          payment_method: clon.id,
          confirm: true,
          capture_method: s.compradorPresente ? metodoCaptura() : "automatic",
          application_fee_amount: s.comisionCentavos,
          description: `día uno · ${concepto(s.numeroExhibicion)} · plan ${s.planId}`,
          // El webhook sólo con esto sabe a qué exhibición e intento aplicar el evento.
          metadata: {
            planId: s.planId,
            exhibicionId: s.exhibicionId,
            numeroExhibicion: String(s.numeroExhibicion),
            intento: String(s.intento),
            compradorId: s.compradorId,
            proyectoId: s.proyectoId,
          },
          // Comprador presente: si el banco pide 3DS, el navegador lo resuelve.
          // Mensualidad: nadie puede autenticar; Stripe lo rechaza con authentication_required.
          ...(s.compradorPresente ? { use_stripe_sdk: true } : { off_session: true }),
        },
        { stripeAccount: cuenta, idempotencyKey: llave }
      );
      return interpretarPaymentIntent(pi, cuenta);
    } catch (err) {
      const rechazo = interpretarErrorStripe(err);
      if (rechazo) return rechazo;
      throw err;
    }
  },

  async prepararTarjeta(s: SolicitudTarjeta): Promise<PreparacionTarjeta> {
    const comprador = await prisma.comprador.findUnique({ where: { id: s.compradorId } });
    if (!comprador) throw new ReglaError("No se encontró al comprador.");
    const api = stripe();

    let customerId = comprador.stripeCustomerId;
    if (!customerId) {
      // La llave hace que dos clics simultáneos creen un solo cliente en Stripe.
      const customer = await api.customers.create(
        {
          name: comprador.nombre,
          ...(comprador.contacto.includes("@") ? { email: comprador.contacto } : {}),
          metadata: { compradorId: comprador.id, folio: comprador.folio },
        },
        { idempotencyKey: `comprador_${comprador.id}:cliente` }
      );
      customerId = customer.id;
      await prisma.comprador.updateMany({
        where: { id: comprador.id, stripeCustomerId: null },
        data: { stripeCustomerId: customerId },
      });
    }

    const si = await api.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: {
        compradorId: comprador.id,
        proyectoId: s.proyectoId,
        // El motor sólo llega aquí con la casilla marcada; queda también en Stripe.
        consentimiento: "cargos_mensualidades_fuera_de_sesion",
      },
    });
    if (!si.client_secret) throw new Error(`Stripe no devolvió el secreto del SetupIntent ${si.id}.`);
    return { clientSecret: si.client_secret };
  },

  async confirmarTarjeta(s: SolicitudConfirmarTarjeta): Promise<TarjetaConfirmada> {
    const comprador = await prisma.comprador.findUnique({
      where: { id: s.compradorId },
      select: { stripeCustomerId: true },
    });
    const si = await stripe().setupIntents.retrieve(s.referenciaPreparacion, {
      expand: ["payment_method"],
    });
    const customer = typeof si.customer === "string" ? si.customer : si.customer?.id;
    if (si.metadata?.compradorId !== s.compradorId || !customer || customer !== comprador?.stripeCustomerId) {
      throw new ReglaError("Esa tarjeta no corresponde a este comprador.");
    }
    if (si.status !== "succeeded") {
      throw new ReglaError(
        si.status === "requires_action"
          ? "Falta que el comprador termine la autenticación con su banco."
          : "La tarjeta no quedó guardada. Vuelve a capturarla."
      );
    }
    const pm = si.payment_method;
    if (!pm) throw new Error(`El SetupIntent ${si.id} terminó sin método de pago.`);
    return typeof pm === "string"
      ? { referenciaTarjeta: pm, descripcion: "tarjeta" }
      : {
          referenciaTarjeta: pm.id,
          descripcion: describirTarjeta(pm.card),
          ...(pm.card ? { venceMes: pm.card.exp_month, venceAnio: pm.card.exp_year } : {}),
        };
  },

  async reembolsar(s: SolicitudReembolso): Promise<ReembolsoHecho> {
    const cuenta = await cuentaDelProyecto(s.proyectoId);
    // Cargo directo: el reembolso vive en la cuenta de Moretti, igual que el cobro.
    const refund = await stripe().refunds.create(
      {
        payment_intent: s.referenciaPasarela,
        amount: s.montoCentavos,
        refund_application_fee: s.devolverComision,
        metadata: { pagoId: s.pagoId, numero: String(s.numero) },
      },
      { stripeAccount: cuenta, idempotencyKey: llaveReembolso(s) }
    );
    return { referenciaReembolso: refund.id, montoCentavos: refund.amount };
  },

  async capturar(s: SolicitudAutorizacion): Promise<ResultadoCobro> {
    const cuenta = await cuentaDelProyecto(s.proyectoId);
    try {
      const pi = await stripe().paymentIntents.capture(
        s.referenciaPasarela,
        {},
        { stripeAccount: cuenta, idempotencyKey: `${s.referenciaPasarela}:captura` }
      );
      return interpretarPaymentIntent(pi, cuenta);
    } catch (err) {
      const rechazo = interpretarErrorStripe(err);
      if (rechazo) return rechazo;
      throw err;
    }
  },

  async liberar(s: SolicitudAutorizacion): Promise<void> {
    const cuenta = await cuentaDelProyecto(s.proyectoId);
    await stripe().paymentIntents.cancel(
      s.referenciaPasarela,
      { cancellation_reason: "requested_by_customer" },
      { stripeAccount: cuenta, idempotencyKey: `${s.referenciaPasarela}:liberar` }
    );
  },
};
