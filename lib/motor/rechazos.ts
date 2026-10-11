/**
 * Los códigos de rechazo del banco: qué significa cada uno, en palabras de
 * quien opera, y qué hace la cobranza con una mensualidad rechazada por ese
 * motivo. Cada código tiene su propia regla, a propósito: así en la bitácora
 * y en el back office se sabe a qué se debe cada rechazo y por qué se
 * reintentó (o no).
 *
 * Los de la especificación (insufficient_funds, generic_decline, lost_card,
 * stolen_card, pickup_card, expired_card) van tal cual. Los demás son
 * propuesta de Charly, por ratificar con Operación (docs/parametros.md).
 *
 * El código original siempre queda en la bitácora y en
 * `Exhibicion.ultimoCodigoRechazo`.
 */

export type AccionRechazo =
  /** Se reintenta solo, una vez por cada elemento: los días después de cada rechazo. */
  | { tipo: "reintentar"; esperaDias: number[] }
  /** La tarjeta no sirve (perdida, robada, retenida, fraude): se marca inválida para todo el plan. */
  | { tipo: "tarjeta_invalida" }
  /** Con esta tarjeta no va a pasar: hace falta otra. */
  | { tipo: "pedir_tarjeta" }
  /** El banco pide que el comprador autorice; fuera de sesión nadie puede. */
  | { tipo: "pedir_autenticacion" }
  /** No sabemos qué es: no se reintenta solo y alguien lo revisa en Stripe. */
  | { tipo: "revisar" };

export type ReglaRechazo = { explicacion: string; accion: AccionRechazo };

const REGLAS: Record<string, ReglaRechazo> = {
  // ── De la especificación ────────────────────────────────────────────────
  insufficient_funds: {
    explicacion: "fondos insuficientes",
    accion: { tipo: "reintentar", esperaDias: [3, 7] },
  },
  generic_decline: {
    explicacion: "el banco lo rechazó sin dar motivo",
    accion: { tipo: "reintentar", esperaDias: [2] },
  },
  lost_card: { explicacion: "la tarjeta está reportada como perdida", accion: { tipo: "tarjeta_invalida" } },
  stolen_card: { explicacion: "la tarjeta está reportada como robada", accion: { tipo: "tarjeta_invalida" } },
  pickup_card: { explicacion: "el banco pidió retener la tarjeta", accion: { tipo: "tarjeta_invalida" } },
  expired_card: { explicacion: "la tarjeta está vencida", accion: { tipo: "pedir_tarjeta" } },

  // ── Propuesta, por ratificar con Operación ─────────────────────────────
  card_declined: {
    // Sin decline_code: Stripe no dijo más. Igual que generic_decline.
    explicacion: "el banco rechazó la tarjeta sin dar motivo",
    accion: { tipo: "reintentar", esperaDias: [2] },
  },
  do_not_honor: {
    explicacion: "el banco no autorizó el cargo, sin dar motivo",
    accion: { tipo: "reintentar", esperaDias: [2] },
  },
  processing_error: {
    explicacion: "error del banco al procesar el cargo",
    accion: { tipo: "reintentar", esperaDias: [1, 3] },
  },
  try_again_later: {
    explicacion: "el banco pidió volver a intentar más tarde",
    accion: { tipo: "reintentar", esperaDias: [1, 3] },
  },
  issuer_not_available: {
    explicacion: "el banco emisor no respondió",
    accion: { tipo: "reintentar", esperaDias: [1, 3] },
  },
  reenter_transaction: {
    explicacion: "el banco pidió volver a mandar el cargo",
    accion: { tipo: "reintentar", esperaDias: [1] },
  },
  card_velocity_exceeded: {
    explicacion: "la tarjeta llegó a su límite de cargos o de monto por ahora",
    accion: { tipo: "reintentar", esperaDias: [3, 7] },
  },
  withdrawal_count_limit_exceeded: {
    explicacion: "la tarjeta llegó a su límite de operaciones por ahora",
    accion: { tipo: "reintentar", esperaDias: [3, 7] },
  },
  fraudulent: { explicacion: "el banco lo marcó como posible fraude", accion: { tipo: "tarjeta_invalida" } },
  restricted_card: { explicacion: "la tarjeta tiene una restricción del banco", accion: { tipo: "tarjeta_invalida" } },
  incorrect_number: { explicacion: "el número de tarjeta no es válido", accion: { tipo: "pedir_tarjeta" } },
  invalid_expiry_month: { explicacion: "el mes de vencimiento no es válido", accion: { tipo: "pedir_tarjeta" } },
  invalid_expiry_year: { explicacion: "el año de vencimiento no es válido", accion: { tipo: "pedir_tarjeta" } },
  incorrect_cvc: { explicacion: "el código de seguridad no coincide", accion: { tipo: "pedir_tarjeta" } },
  invalid_account: { explicacion: "la cuenta de la tarjeta no es válida", accion: { tipo: "pedir_tarjeta" } },
  new_account_information_available: {
    explicacion: "el banco tiene datos nuevos de la tarjeta",
    accion: { tipo: "pedir_tarjeta" },
  },
  card_not_supported: { explicacion: "la tarjeta no acepta este tipo de cargo", accion: { tipo: "pedir_tarjeta" } },
  currency_not_supported: { explicacion: "la tarjeta no acepta cargos en pesos", accion: { tipo: "pedir_tarjeta" } },
  transaction_not_allowed: { explicacion: "el banco no permite este cargo con la tarjeta", accion: { tipo: "pedir_tarjeta" } },
  not_permitted: { explicacion: "el banco no permite este cargo", accion: { tipo: "pedir_tarjeta" } },
  authentication_required: {
    explicacion: "el banco pide que el comprador autorice el cargo",
    accion: { tipo: "pedir_autenticacion" },
  },

  // ── Del ciclo del cobro, no del banco ──────────────────────────────────
  autorizacion_liberada: {
    explicacion: "se liberó la autorización sin cobrarla",
    accion: { tipo: "revisar" },
  },
};

export function reglaDeRechazo(codigo: string): ReglaRechazo {
  return REGLAS[codigo] ?? { explicacion: "motivo no reconocido", accion: { tipo: "revisar" } };
}

export function explicarRechazo(codigo: string): string {
  return reglaDeRechazo(codigo).explicacion;
}

/** Para la documentación y las pruebas. */
export const CODIGOS_CONOCIDOS = Object.keys(REGLAS);
