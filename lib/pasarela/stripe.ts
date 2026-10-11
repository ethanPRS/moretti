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
  type SolicitudTransferencia,
  type ResultadoTransferencia,
} from "./contrato";
import { describirTarjeta, interpretarErrorStripe, interpretarPaymentIntent } from "./stripe-respuestas";

/**
 * La pasarela real (S1-06, S1-07, S1-09). Implementa ./contrato.ts v2.3.
 *
 * - D-34 (Ana Cris, 5 oct): cobra la PLATAFORMA y retiene. La tarjeta vive
 *   en la plataforma (D-32) y el PaymentIntent también: sin `Stripe-Account`,
 *   sin `transfer_data` y sin `application_fee_amount`. La comisión del canal
 *   es lo que la plataforma no le transfiere a Moretti; el motor la guarda
 *   en cada `Pago`.
 * - A Moretti se le paga con `transferir` (una `Transfer` a su cuenta
 *   conectada) cuando Ana Cris lo autoriza desde el back office.
 * - Los montos ya llegan en centavos enteros: no se multiplica nada.
 * - La llave es `llaveIdempotencia(solicitud)`. Stripe recuerda también los
 *   rechazos, por eso el intento va en la llave.
 * - Sólo modo prueba: sin `sk_test_` no se inicializa.
 * - Integración del 11 oct: el código de Charly (rama charly-backend-final)
 *   hacía cargos directos en la cuenta de Moretti; se pasó a D-34 sin
 *   cambiar el contrato.
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
      // D-34: el cargo es en la plataforma, con la tarjeta que ya vive ahí.
      const pi = await api.paymentIntents.create(
        {
          amount: s.montoCentavos,
          currency: "mxn",
          customer: comprador.stripeCustomerId,
          payment_method_types: ["card"],
          payment_method: comprador.stripePaymentMethodId,
          confirm: true,
          capture_method: s.compradorPresente ? metodoCaptura() : "automatic",
          // Agrupa los cargos del proyecto para la transferencia a Moretti.
          transfer_group: grupoTransferencia(s.proyectoId),
          description: `día uno · ${concepto(s.numeroExhibicion)} · plan ${s.planId}`,
          // El webhook sólo con esto sabe a qué exhibición e intento aplicar el evento.
          metadata: {
            planId: s.planId,
            exhibicionId: s.exhibicionId,
            numeroExhibicion: String(s.numeroExhibicion),
            intento: String(s.intento),
            compradorId: s.compradorId,
            proyectoId: s.proyectoId,
            comisionCentavos: String(s.comisionCentavos),
          },
          // Comprador presente: si el banco pide 3DS, el navegador lo resuelve.
          // Mensualidad: nadie puede autenticar; Stripe lo rechaza con authentication_required.
          ...(s.compradorPresente ? { use_stripe_sdk: true } : { off_session: true }),
        },
        { idempotencyKey: llave }
      );
      return interpretarPaymentIntent(pi);
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
    // D-34: el cobro vive en la plataforma, el reembolso también. Sin
    // application fee no hay `refund_application_fee`: si se devuelve o no la
    // comisión lo decide el monto que manda el motor, y queda en la metadata.
    // Si el pago ya se le transfirió a Moretti, revertir esa parte es otra
    // operación (D-34, «reversals»); el motor la registra aparte.
    const refund = await stripe().refunds.create(
      {
        payment_intent: s.referenciaPasarela,
        amount: s.montoCentavos,
        metadata: { pagoId: s.pagoId, numero: String(s.numero), devolverComision: String(s.devolverComision) },
      },
      { idempotencyKey: llaveReembolso(s) }
    );
    return { referenciaReembolso: refund.id, montoCentavos: refund.amount };
  },

  async capturar(s: SolicitudAutorizacion): Promise<ResultadoCobro> {
    try {
      const pi = await stripe().paymentIntents.capture(
        s.referenciaPasarela,
        {},
        { idempotencyKey: `${s.referenciaPasarela}:captura` }
      );
      return interpretarPaymentIntent(pi);
    } catch (err) {
      const rechazo = interpretarErrorStripe(err);
      if (rechazo) return rechazo;
      throw err;
    }
  },

  async liberar(s: SolicitudAutorizacion): Promise<void> {
    await stripe().paymentIntents.cancel(
      s.referenciaPasarela,
      { cancellation_reason: "requested_by_customer" },
      { idempotencyKey: `${s.referenciaPasarela}:liberar` }
    );
  },

  async transferir(s: SolicitudTransferencia): Promise<ResultadoTransferencia> {
    const cuenta = await cuentaDelProyecto(s.proyectoId);
    try {
      const transfer = await stripe().transfers.create(
        {
          amount: s.montoCentavos,
          currency: "mxn",
          destination: cuenta,
          transfer_group: grupoTransferencia(s.proyectoId),
          // Con un solo cargo, se liga a él: Stripe espera a que esos fondos
          // estén disponibles en lugar de fallar por saldo insuficiente.
          ...(s.referenciasCargos.length === 1 ? { source_transaction: await cargoDe(s.referenciasCargos[0]) } : {}),
          metadata: { transferenciaId: s.transferenciaId, proyectoId: s.proyectoId, cargos: s.referenciasCargos.join(",").slice(0, 500) },
        },
        { idempotencyKey: `transferencia_${s.transferenciaId}` }
      );
      return { estado: "exitoso", referenciaPasarela: transfer.id };
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError) return { estado: "fallido", mensaje: err.message };
      throw err;
    }
  },
};

/** `proyecto_<id>`: los cargos y las transferencias de un proyecto van juntos. */
export function grupoTransferencia(proyectoId: string): string {
  return `proyecto_${proyectoId}`;
}

/** `source_transaction` pide el cargo (ch_…), no el PaymentIntent (pi_…). */
async function cargoDe(referencia: string): Promise<string> {
  if (!referencia.startsWith("pi_")) return referencia;
  const pi = await stripe().paymentIntents.retrieve(referencia);
  const cargo = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
  if (!cargo) throw new ReglaError(`El cobro ${referencia} todavía no tiene un cargo en Stripe.`);
  return cargo;
}
