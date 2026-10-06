import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * La contraseña del back office nunca se guarda en claro: en .env va su hash
 * scrypt (ADMIN_PASSWORD_HASH), con el formato `scrypt:<sal hex>:<hash hex>` (sin «$»: Next expande variables en .env).
 * Para generarlo: `node scripts/hash-contrasena.mjs 'la-contraseña'`.
 */
const LARGO = 64;

function derivar(contrasena: string, sal: Buffer): Promise<Buffer> {
  return new Promise((ok, mal) =>
    scrypt(contrasena.normalize("NFKC"), sal, LARGO, { N: 16384, r: 8, p: 1 }, (err, clave) =>
      err ? mal(err) : ok(clave)
    )
  );
}

export async function hashContrasena(contrasena: string): Promise<string> {
  const sal = randomBytes(16);
  return `scrypt:${sal.toString("hex")}:${(await derivar(contrasena, sal)).toString("hex")}`;
}

/** Compara en tiempo constante. Un hash mal formado nunca deja pasar. */
export async function verificarContrasena(contrasena: string, guardado: string): Promise<boolean> {
  const [algo, salHex, hashHex] = guardado.split(":");
  if (algo !== "scrypt" || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  if (esperado.length !== LARGO) return false;
  const calculado = await derivar(contrasena, Buffer.from(salHex, "hex"));
  return timingSafeEqual(calculado, esperado);
}
