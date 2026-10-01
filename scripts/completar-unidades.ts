// Agrega unidades libres a los prototipos que no tengan suficientes, sin
// tocar lo que ya existe. Uso: npx tsx scripts/completar-unidades.ts
import { prisma } from "../lib/prisma";
import { completarUnidades } from "../prisma/sembrar";

completarUnidades()
  .then((n) => console.log(`Unidades agregadas: ${n}`))
  .finally(() => prisma.$disconnect());
