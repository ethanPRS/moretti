import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const desarrollador = await prisma.desarrollador.create({
    data: {
      nombre: "Grupo Vía",
      contacto: "contacto@grupovia.example",
      condicionesComerciales: "Comisión 15%, anticipo 10%.",
    },
  });

  const proyecto = await prisma.proyecto.create({
    data: {
      desarrolladorId: desarrollador.id,
      nombre: "Vía Residencial Contry",
      etapaPipeline: "Vendiendo",
      numeroUnidades: 40,
      porcentajeAnticipo: 0.1,
      porcentajeComision: 0.15,
    },
  });

  const protoA2 = await prisma.prototipo.create({
    data: { proyectoId: proyecto.id, clave: "A2", superficie: 65, recamaras: 2 },
  });
  const protoB3 = await prisma.prototipo.create({
    data: { proyectoId: proyecto.id, clave: "B3", superficie: 85, recamaras: 3 },
  });

  const paquetes = await Promise.all([
    prisma.paquete.create({
      data: { nivel: 1, nombre: "Básico", partidas: ["Cocina"] },
    }),
    prisma.paquete.create({
      data: { nivel: 2, nombre: "Cocina + Clima", partidas: ["Cocina", "Clima"] },
    }),
    prisma.paquete.create({
      data: {
        nivel: 3,
        nombre: "Cocina + Clima + Clósets",
        partidas: ["Cocina", "Clima", "Clósets"],
      },
    }),
    prisma.paquete.create({
      data: {
        nivel: 4,
        nombre: "Integral",
        partidas: ["Cocina", "Clima", "Clósets", "Persianas"],
      },
    }),
  ]);

  const preciosPorPrototipo: Record<string, number[]> = {
    [protoA2.id]: [65000, 95000, 125000, 155000],
    [protoB3.id]: [85000, 120000, 155000, 190000],
  };

  for (const [prototipoId, montos] of Object.entries(preciosPorPrototipo)) {
    for (let i = 0; i < paquetes.length; i++) {
      await prisma.precio.create({
        data: {
          prototipoId,
          paqueteId: paquetes[i].id,
          monto: montos[i],
        },
      });
    }
  }

  await prisma.unidad.createMany({
    data: [
      { proyectoId: proyecto.id, prototipoId: protoA2.id, torre: "1", numero: "101" },
      { proyectoId: proyecto.id, prototipoId: protoA2.id, torre: "1", numero: "102" },
      { proyectoId: proyecto.id, prototipoId: protoB3.id, torre: "1", numero: "201" },
      { proyectoId: proyecto.id, prototipoId: protoB3.id, torre: "2", numero: "101" },
    ],
  });

  console.log("Seed listo:", { desarrollador: desarrollador.nombre, proyecto: proyecto.nombre });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
