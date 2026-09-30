/**
 * Sesión ligera para el back office de día uno.
 *
 * Usa HMAC-SHA256 (Web Crypto, disponible en Edge y Node).
 * El token viaja en una cookie HttpOnly, Secure, SameSite=Lax.
 *
 * Formato del token: base64url(payload) + "." + base64url(firma)
 *   payload = JSON { sub: "admin", exp: <unix-ms> }
 *
 * Para producción real se recomienda NextAuth / Auth.js o similar;
 * esto es suficiente para el prototipo académico.
 */

const COOKIE_NAME = "dno_admin_v1";
const TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

// ── Utilidades base64url ──────────────────────────────────────────────────────

function b64uEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64uDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const bin = atob(padded + "=".repeat(pad));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ── Clave HMAC ────────────────────────────────────────────────────────────────

async function clave(): Promise<CryptoKey> {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) throw new Error("SESSION_SECRET falta en .env o es muy corto (mínimo 32 caracteres).");
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(raw),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// ── Crear token ───────────────────────────────────────────────────────────────

export async function crearToken(): Promise<string> {
  const payload = { sub: "admin", exp: Date.now() + TTL_MS };
  const enc = new TextEncoder();
  const payloadB64 = b64uEncode(enc.encode(JSON.stringify(payload)));

  const k = await clave();
  const firma = await crypto.subtle.sign("HMAC", k, enc.encode(payloadB64));
  const firmaB64 = b64uEncode(new Uint8Array(firma));

  return `${payloadB64}.${firmaB64}`;
}

// ── Verificar token ───────────────────────────────────────────────────────────

/**
 * Devuelve `true` si el token es válido y no ha expirado.
 * No lanza: cualquier problema devuelve `false`.
 */
export async function verificarToken(token: string): Promise<boolean> {
  try {
    const [payloadB64, firmaB64] = token.split(".");
    if (!payloadB64 || !firmaB64) return false;

    const enc = new TextEncoder();
    const k = await clave();
    const valido = await crypto.subtle.verify(
      "HMAC",
      k,
      new Uint8Array(b64uDecode(firmaB64)),
      enc.encode(payloadB64)
    );
    if (!valido) return false;

    const payload = JSON.parse(new TextDecoder().decode(b64uDecode(payloadB64)));
    if (payload.sub !== "admin" || typeof payload.exp !== "number" || Date.now() > payload.exp) return false;

    return true;
  } catch {
    return false;
  }
}

// ── Parámetros de la cookie ───────────────────────────────────────────────────

export { COOKIE_NAME };

export function cookieOpciones(borrar = false) {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    // "/" y no "/admin": la cookie también tiene que llegar a /api.
    path: "/",
    maxAge: borrar ? 0 : TTL_MS / 1000,
  };
}
