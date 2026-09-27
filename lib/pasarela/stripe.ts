import type { Pasarela, SolicitudCobro, ResultadoCobro } from "./contrato";

/**
 * CHARLY — este es tu archivo.
 *
 * Implementa `cobrar` llamando a Stripe de verdad, respetando el
 * contrato de ./contrato.ts. No cambies la firma de la función ni el
 * tipo de retorno sin avisar a Ethan: el motor depende de ella tal cual
 * está.
 *
 * Pendientes que ya conoces del archivo 14 y de la hoja 15:
 * - Llave de idempotencia: `plan_${planId}:exh_${numeroExhibicion}:int_${intento}`
 *   (nunca la hora, nunca un aleatorio). El intento va porque Stripe
 *   recuerda también los rechazos: sin él, un reintento no reintenta.
 * - Cargo directo sobre la cuenta de Moretti (Stripe-Account) con
 *   application_fee_amount = montoComision, en centavos.
 * - compradorPresente=true → PaymentIntent normal (anticipo).
 *   compradorPresente=false → off_session: true (mensualidad).
 * - Si Stripe rechaza el cobro, regresa `exitoso:false` con el
 *   `codigoRechazo` que mande Stripe (insufficient_funds, etc.) y
 *   `reintentar` según la tabla de la especificación — el motor decide
 *   cuándo reintentar, tú solo le pasas el código.
 * - Dónde vive la tarjeta guardada (plataforma o cuenta de Moretti):
 *   pendiente de la decisión con Ana Cris (actividad H del Sprint 0).
 */
export const pasarelaStripe: Pasarela = {
  async cobrar(_solicitud: SolicitudCobro): Promise<ResultadoCobro> {
    throw new Error("pasarelaStripe.cobrar: todavía no implementada — Sprint 1, actividades K/L/M.");
  },
};
