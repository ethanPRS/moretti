import { prisma } from "@/lib/prisma";
import { sembrarCatalogo } from "@/prisma/sembrar";

/**
 * Deja la base de pruebas vacía (menos el historial de migraciones) y con el
 * catálogo real sembrado. Se llama antes de cada prueba de integración.
 */
export async function baseLimpiaConCatalogo() {
  await vaciarBase();
  await sembrarCatalogo();
}

export async function vaciarBase() {
  // Segundo candado, por si alguien corre una prueba de integración sin el
  // proyecto «integracion» de vitest.config.mts.
  const nombre = new URL(process.env.DATABASE_URL ?? "postgresql://x/sin-base").pathname.slice(1);
  if (!/_(pruebas|test)$/.test(nombre)) {
    throw new Error(`Las pruebas de integración no corren contra «${nombre}»: no es una base de pruebas.`);
  }
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tablas.length === 0) return;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`
  );
}

let unidadesCreadas = 0;

/** Una unidad libre nueva con el prototipo pedido. */
export async function unidadLibre(clavePrototipo: string) {
  const prototipo = await prisma.prototipo.findFirstOrThrow({ where: { clave: clavePrototipo } });
  return prisma.unidad.create({
    data: {
      proyectoId: prototipo.proyectoId,
      prototipoId: prototipo.id,
      torre: "PRUEBA",
      numero: String(++unidadesCreadas),
    },
  });
}

export async function paquete(slug: string) {
  return prisma.paquete.findUniqueOrThrow({ where: { slug } });
}

export async function firmarContrato(unidadId: string) {
  return prisma.contrato.create({
    data: {
      unidadId,
      archivoNombre: "contrato-prueba.pdf",
      quienFirmo: "Comprador de prueba",
      fechaFirma: new Date("2026-09-28T12:00:00"),
    },
  });
}

export async function eventosDelPlan(planId: string) {
  return prisma.evento.findMany({
    where: { entidadTipo: "plan", entidadId: planId },
    orderBy: { fecha: "asc" },
  });
}
