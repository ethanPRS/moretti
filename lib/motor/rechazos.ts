/**
 * Los códigos de rechazo que manda Stripe, en palabras de quien opera. El
 * código original siempre se guarda en la bitácora; esto sólo lo explica.
 * Qué hacer con cada uno (reintentar o pedir tarjeta nueva) es de la
 * actividad P del Sprint 2 y depende de los parámetros abiertos de la hoja 15.
 */
const EXPLICACION: Record<string, string> = {
  insufficient_funds: "fondos insuficientes",
  generic_decline: "el banco lo rechazó sin dar motivo",
  card_declined: "el banco rechazó la tarjeta",
  lost_card: "la tarjeta está reportada como perdida",
  stolen_card: "la tarjeta está reportada como robada",
  pickup_card: "el banco pidió retener la tarjeta",
  expired_card: "la tarjeta está vencida",
  incorrect_cvc: "el código de seguridad no coincide",
  processing_error: "error del banco al procesar; se puede volver a intentar",
  authentication_required: "el banco pide que el comprador autorice el cargo",
};

export function explicarRechazo(codigo: string): string {
  return EXPLICACION[codigo] ?? "motivo no reconocido";
}
