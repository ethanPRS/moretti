/**
 * Error de regla de negocio. El mensaje explica QUÉ falta, no solo que no se
 * permite: lo lee quien opera y tiene que saber qué hacer.
 *
 * Vive aparte, sin Prisma, para que las funciones puras que también corren
 * en el navegador (el cotizador) lo puedan lanzar.
 */
export class ReglaError extends Error {
  override name = "ReglaError";
}

const pesos = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const conCentavos = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** $176,200 — el formato de dinero de los mensajes. */
export function mx(monto: number): string {
  return `${monto < 0 ? "-" : ""}$${pesos.format(Math.abs(monto))}`;
}

/** $7,929.00 — para comisiones y montos con centavos. */
export function mxc(monto: number): string {
  return `${monto < 0 ? "-" : ""}$${conCentavos.format(Math.abs(monto))}`;
}
