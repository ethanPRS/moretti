/**
 * La IP del cliente, para los frenos contra abuso.
 *
 * `X-Forwarded-For` lo puede escribir cualquiera; sólo es confiable si lo
 * pone un proxy propio (Vercel lo sobrescribe). Por eso sólo se lee con
 * CONFIAR_PROXY=1. Sin esa variable, todos comparten una clave: el freno
 * sigue funcionando (más estricto), sólo que no distingue IP.
 * (Auditoría 6 oct, H-4.)
 */
export function ipCliente(headers: Headers): string {
  if (process.env.CONFIAR_PROXY !== "1") return "sin-proxy";
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "sin-ip";
}
