import type {
  Pasarela,
  PreparacionTarjeta,
  ResultadoCobro,
  SolicitudCobro,
  SolicitudTarjeta,
  SolicitudTransferencia,
  ResultadoTransferencia,
} from "./contrato";

/**
 * CHARLY — este es tu archivo.
 *
 * Implementa la interfaz de ./contrato.ts llamando a Stripe de verdad. No
 * cambies las firmas ni los tipos de retorno sin avisar a Ethan: el motor
 * depende de ellos tal cual están. La versión 2 del contrato (S1-01) y lo que
 * cambió respecto a la 1 está en docs/contrato-pasarela.md.
 *
 * Pendientes que ya conoces del archivo 14 y de la hoja 15:
 * - Llave de idempotencia: usa `llaveIdempotencia(solicitud)` de ./contrato
 *   (nunca la hora, nunca un aleatorio). El intento va porque Stripe
 *   recuerda también los rechazos: sin él, un reintento no reintenta.
 * - D-34 (5 oct): cobra la PLATAFORMA y retiene. El PaymentIntent se crea
 *   en la plataforma, sin Stripe-Account, sin transfer_data y sin
 *   application_fee_amount. La comisión es lo que la plataforma no
 *   transfiere; `comisionCentavos` se guarda en el pago. Los montos ya
 *   llegan en centavos enteros: no multipliques por 100.
 * - `transferir`: Transfer a la cuenta conectada del proyecto por
 *   `montoCentavos` (ya neto), con idempotencyKey
 *   `transferencia_${transferenciaId}` y transfer_group por proyecto.
 * - compradorPresente=true → PaymentIntent normal (anticipo).
 *   compradorPresente=false → off_session: true (mensualidad).
 * - status requires_action o processing → `estado: "pendiente"`, con el id
 *   del PaymentIntent como referencia. El motor no marca nada como pagado
 *   ni cuenta un intento nuevo; el pago lo aplica el webhook.
 * - Si Stripe rechaza el cobro, regresa `estado: "rechazado"` con el
 *   `codigoRechazo` que mande Stripe (insufficient_funds, etc.) y
 *   `reintentar` según la tabla de la especificación — el motor decide
 *   cuándo reintentar, tú solo le pasas el código.
 * - La tarjeta vive en la plataforma (D-32) y ya no se clona: el cargo
 *   también es en la plataforma (D-34).
 */
export const pasarelaStripe: Pasarela = {
  async cobrar(_solicitud: SolicitudCobro): Promise<ResultadoCobro> {
    throw new Error("pasarelaStripe.cobrar: todavía no implementada — Sprint 1, S1-07 y S1-09.");
  },
  async prepararTarjeta(_solicitud: SolicitudTarjeta): Promise<PreparacionTarjeta> {
    throw new Error("pasarelaStripe.prepararTarjeta: todavía no implementada — Sprint 1, S1-06.");
  },
  async transferir(_solicitud: SolicitudTransferencia): Promise<ResultadoTransferencia> {
    throw new Error("pasarelaStripe.transferir: todavía no implementada — D-34, Charly.");
  },
};
