import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { urlBaseDePruebas } from "./pruebas/base-de-pruebas.mjs";

/**
 * Dos proyectos:
 * - unitarias: funciones puras, sin base de datos (*.test.ts).
 * - integracion: el motor contra Postgres (*.int.test.ts). Usan su propia
 *   base (ver pruebas/base-de-pruebas.mjs) y corren de una en una, porque
 *   comparten las tablas.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Si no hay base configurada, las unitarias corren igual; el globalSetup de
  // integración es el que se detiene y explica qué falta.
  let urlPruebas = "";
  try {
    urlPruebas = urlBaseDePruebas(env);
  } catch {
    // se reporta en pruebas/preparar-base.ts
  }

  return {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL(".", import.meta.url)),
      },
    },
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "unitarias",
            include: ["**/*.test.ts"],
            exclude: ["**/*.int.test.ts", "**/*.stripe.test.ts", "node_modules/**", ".next/**"],
          },
        },
        {
          extends: true,
          test: {
            name: "integracion",
            include: ["**/*.int.test.ts"],
            exclude: ["node_modules/**", ".next/**"],
            globalSetup: ["./pruebas/preparar-base.ts"],
            env: { DATABASE_URL: urlPruebas },
            fileParallelism: false,
            testTimeout: 30_000,
            hookTimeout: 60_000,
          },
        },
        {
          // De extremo a extremo contra el modo prueba de Stripe (npm run test:stripe).
          // Fuera de `npm test`: necesita red, llaves de prueba y una cuenta conectada.
          extends: true,
          test: {
            name: "stripe",
            include: ["**/*.stripe.test.ts"],
            exclude: ["node_modules/**", ".next/**"],
            globalSetup: ["./pruebas/preparar-base.ts"],
            env: {
              DATABASE_URL: urlPruebas,
              STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY ?? "",
              STRIPE_E2E_CUENTA: env.STRIPE_E2E_CUENTA ?? "",
            },
            fileParallelism: false,
            testTimeout: 60_000,
            hookTimeout: 60_000,
          },
        },
      ],
    },
  };
});
