import type { ResultadoCobro } from "./contrato";

/**
 * Cómo se traduce lo que contesta Stripe al contrato del motor. Vive aparte
 * de stripe.ts, sin red ni base de datos, para probarlo con objetos armados
 * a mano (stripe-respuestas.test.ts).
 */

/** Lo que se usa de un PaymentIntent. */
export type PaymentIntentLeido = {
  id: string;
  status: string;
  client_secret?: string | null;
  last_payment_error?: { code?: string; decline_code?: string; advice_code?: string; message?: string } | null;
};

/** Lo que se usa de un error de Stripe. */
type ErrorStripe = {
  type: string;
  code?: string;
  decline_code?: string;
  advice_code?: string;
  message: string;
  payment_intent?: { id: string };
};

/**
 * Qué códigos vale la pena reintentar más tarde. Provisional: la política de
 * reintentos es de la actividad P (Sprint 2) y depende de la hoja 15. El
 * motor decide cuándo; esto sólo informa. Si Stripe manda `advice_code`, manda él.
 */
const REINTENTABLES = new Set([
  "insufficient_funds",
  "processing_error",
  "try_again_later",
  "issuer_not_available",
  "reenter_transaction",
]);

/** Si vale la pena reintentar con la misma tarjeta. Si Stripe manda `advice_code`, manda él. */
export function esReintentable(codigo: string, adviceCode?: string | null): boolean {
  if (adviceCode === "try_again_later") return true;
  if (adviceCode === "do_not_try_again" || adviceCode === "confirm_card_data") return false;
  return REINTENTABLES.has(codigo);
}

export function interpretarPaymentIntent(pi: PaymentIntentLeido, cuentaConectada: string): ResultadoCobro {
  switch (pi.status) {
    case "succeeded":
      return { estado: "exitoso", referenciaPasarela: pi.id };

    case "processing":
      return { estado: "pendiente", referenciaPasarela: pi.id, motivo: "el banco lo está procesando" };

    case "requires_capture":
      // capture_method = manual: el dinero está apartado, no cobrado.
      return {
        estado: "pendiente",
        referenciaPasarela: pi.id,
        motivo: "el cargo quedó autorizado; falta capturarlo o liberarlo",
      };

    case "requires_action":
      return {
        estado: "pendiente",
        referenciaPasarela: pi.id,
        motivo: "el banco pidió que el comprador se autentique",
        ...(pi.client_secret ? { accion: { clientSecret: pi.client_secret, cuentaConectada } } : {}),
      };

    case "requires_payment_method": {
      // Normalmente Stripe lanza el error de tarjeta; si sólo deja el estado, se lee de aquí.
      const e = pi.last_payment_error;
      const codigo = e?.decline_code ?? e?.code ?? "card_declined";
      return {
        estado: "rechazado",
        codigoRechazo: codigo,
        mensaje: e?.message ?? "El banco rechazó el cargo.",
        reintentar: esReintentable(codigo, e?.advice_code),
        ...(e?.advice_code ? { consejo: e.advice_code } : {}),
        referenciaPasarela: pi.id,
      };
    }

    default:
      // requires_confirmation, canceled: con confirm=true no deberían salir.
      // Si salen, que se note.
      throw new Error(`Stripe dejó el cobro ${pi.id} en «${pi.status}», que el contrato no contempla.`);
  }
}

/**
 * Un rechazo del banco llega como excepción (StripeCardError). Lo convierte
 * en `rechazado`; cualquier otro error devuelve null y se deja subir, para
 * que el motor lo trate como «la pasarela no respondió».
 */
export function interpretarErrorStripe(err: unknown): ResultadoCobro | null {
  if (!esErrorStripe(err) || err.type !== "StripeCardError") return null;
  const codigo = err.decline_code ?? err.code ?? "card_declined";
  return {
    estado: "rechazado",
    codigoRechazo: codigo,
    mensaje: err.message,
    reintentar: esReintentable(codigo, err.advice_code),
    ...(err.advice_code ? { consejo: err.advice_code } : {}),
    ...(err.payment_intent?.id ? { referenciaPasarela: err.payment_intent.id } : {}),
  };
}

function esErrorStripe(err: unknown): err is ErrorStripe {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { type?: unknown }).type === "string" &&
    (err as { type: string }).type.startsWith("Stripe")
  );
}

/** Para la bitácora: «visa terminación 4242». Nunca el número completo. */
export function describirTarjeta(card: { brand?: string | null; last4?: string | null } | null | undefined): string {
  if (!card?.last4) return "tarjeta";
  return `${card.brand ?? "tarjeta"} terminación ${card.last4}`;
}
