import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const PAQUETES_PRUEBA = [
  {
    nivel: 1,
    nombre: "Casa Lista",
    descripcion: "Paquete ilustrativo para pruebas, no representa una cotización comercial.",
    partidas: [
      "Cocina integral sobre diseño",
      "Clósets de recámaras",
      "Carpintería complementaria",
    ],
    precio: 147300,
  },
  {
    nivel: 2,
    nombre: "Confort",
    descripcion: "Casa Lista más climatización. Datos ilustrativos de prueba.",
    partidas: ["Clima minisplit inverter en sala y recámaras"],
    precio: 176200,
  },
  {
    nivel: 3,
    nombre: "Plus",
    descripcion: "Confort más remates y cuarto de lavado. Datos ilustrativos de prueba.",
    partidas: ["Muro decorativo en sala", "Cuarto de lavado equipado"],
    precio: 195600,
  },
  {
    nivel: 4,
    nombre: "Total",
    descripcion: "Paquete completo ilustrativo para pruebas, no comercial.",
    partidas: [
      "Pantalla de gran formato",
      "Refrigerador",
      "Lavadora",
      "Estufa",
      "Vale de muebles para estrenar",
    ],
    precio: 375800,
  },
] as const;

async function main() {
  const paquetes = new Map<number, string>();
  let paquetesCreados = 0;
  let preciosCreados = 0;

  for (const paquetePrueba of PAQUETES_PRUEBA) {
    let paquete = await prisma.paquete.findUnique({ where: { nivel: paquetePrueba.nivel } });
    if (!paquete) {
      paquete = await prisma.paquete.create({
        data: {
          nivel: paquetePrueba.nivel,
          slug: paquetePrueba.nombre.toLowerCase().replace(" ", "-"),
          nombre: paquetePrueba.nombre,
          descripcion: paquetePrueba.descripcion,
          partidas: [...paquetePrueba.partidas],
        },
      });
      paquetesCreados += 1;
    }
    paquetes.set(paquetePrueba.nivel, paquete.id);
  }

  const prototipos = await prisma.prototipo.findMany({ select: { id: true } });
  for (const prototipo of prototipos) {
    for (const paquetePrueba of PAQUETES_PRUEBA) {
      const paqueteId = paquetes.get(paquetePrueba.nivel)!;
      const precioVigente = await prisma.precio.findFirst({
        where: { prototipoId: prototipo.id, paqueteId, vigenteHasta: null },
        select: { id: true },
      });
      if (precioVigente) continue;

      await prisma.precio.create({
        data: {
          prototipoId: prototipo.id,
          paqueteId,
          monto: new Prisma.Decimal(paquetePrueba.precio),
        },
      });
      preciosCreados += 1;
    }
  }

  console.log(
    `Catálogo dummy listo: ${paquetesCreados} paquetes creados, ${preciosCreados} precios de prueba creados; los registros existentes se conservaron.`
  );
}

main()
  .catch((error) => {
    console.error("No se pudo preparar el catálogo de paquetes de prueba.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
