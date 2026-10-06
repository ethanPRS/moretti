import { execFileSync } from "node:child_process";
import { loadEnv } from "vite";
import { urlBaseDePruebas } from "./base-de-pruebas.mjs";

/**
 * Se corre una vez antes de las pruebas de integración: borra la base de
 * pruebas y le aplica todas las migraciones desde cero. Así cada corrida
 * prueba también que las migraciones levantan una base vacía.
 */
export default function prepararBase() {
  const url = urlBaseDePruebas(loadEnv("test", process.cwd(), ""));
  execFileSync(
    "npx",
    ["prisma", "migrate", "reset", "--force", "--skip-seed", "--skip-generate"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" }
  );
}
