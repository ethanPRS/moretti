/**
 * Token del apartado (auditoría H-2, reabierta al integrar la rama de Charly).
 *
 * El comprador aparta sin cuenta: `/api/apartar` le devuelve este token y el
 * navegador lo manda en `x-apartado` al guardar la tarjeta y cobrar el
 * anticipo. Sin él, conocer el id de un plan no basta para cambiarle la
 * tarjeta ni para cobrarle el anticipo.
 *
 * Formato: `<exp unix-ms>.<base64url(HMAC-SHA256(planId + "." + exp))>`,
 * firmado con SESSION_SECRET. Dura 2 horas: lo que tarda apartar.
 */

export const ENCABEZADO_APARTADO = "x-apartado";
const TTL_MS = 2 * 60 * 60 * 1000;

function b64u(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function firmar(texto: string): Promise<string> {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) throw new Error("SESSION_SECRET falta en .env o es muy corto (mínimo 32 caracteres).");
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(texto)));
}

export async function tokenApartado(planId: string, ahora = Date.now()): Promise<string> {
  const exp = ahora + TTL_MS;
  return `${exp}.${await firmar(`${planId}.${exp}`)}`;
}

/** No lanza: cualquier problema es `false`. Compara en tiempo constante. */
export async function verificarApartado(planId: string, token: string | null | undefined, ahora = Date.now()): Promise<boolean> {
  try {
    if (!token) return false;
    const [expTxt, firma] = token.split(".");
    const exp = Number(expTxt);
    if (!Number.isFinite(exp) || exp < ahora || !firma) return false;
    const esperada = await firmar(`${planId}.${exp}`);
    if (esperada.length !== firma.length) return false;
    let dif = 0;
    for (let i = 0; i < firma.length; i++) dif |= firma.charCodeAt(i) ^ esperada.charCodeAt(i);
    return dif === 0;
  } catch {
    return false;
  }
}
