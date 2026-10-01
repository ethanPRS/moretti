// Genera el valor de ADMIN_PASSWORD_HASH para .env (mismo formato que lib/contrasena.ts).
// Uso: node scripts/hash-contrasena.mjs 'la-contraseña'
import { randomBytes, scryptSync } from "node:crypto";

const contrasena = process.argv[2];
if (!contrasena || contrasena.length < 8) {
  console.error("Pasa la contraseña (mínimo 8 caracteres) como argumento.");
  process.exit(1);
}
const sal = randomBytes(16);
const hash = scryptSync(contrasena.normalize("NFKC"), sal, 64, { N: 16384, r: 8, p: 1 });
console.log(`scrypt:${sal.toString("hex")}:${hash.toString("hex")}`);
