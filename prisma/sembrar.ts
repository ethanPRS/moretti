import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { darDeAlta, registrarContrato, cobrarExhibicion } from "../lib/motor/planes";
import { crearPasarelaFalsa } from "../lib/pasarela/falsa";
import type { Pasarela } from "../lib/pasarela/contrato";
import { CATALOGO, PARTIDAS, PAQUETE_PARTIDAS, listaDePrecios } from "./catalogo";

/**
 * Lo que siembran el seed (prisma/seed.ts) y las pruebas de integración: el
 * mismo catálogo, para que las pruebas corran contra los datos reales.
 */

/** Contenido y renders tomados de la maqueta del sitio. */
export const PAQUETES = [
  {
    nivel: 1,
    slug: "casa-lista",
    nombre: "Casa Lista",
    descripcion: "Lo indispensable para habitar",
    imagen: "/paquetes/casa-lista.jpg",
    partidas: [
      "Cocina integral sobre diseño",
      "Clósets de recámaras",
      "Carpintería complementaria",
    ],
  },
  {
    nivel: 2,
    slug: "confort",
    nombre: "Confort",
    descripcion: "Todo lo anterior, más el clima",
    imagen: "/paquetes/confort.jpg",
    partidas: ["Clima minisplit inverter en sala y en cada recámara"],
  },
  {
    nivel: 3,
    slug: "plus",
    nombre: "Plus",
    descripcion: "Todo lo anterior, más los remates",
    imagen: "/paquetes/plus.jpg",
    partidas: ["Muro decorativo en sala", "Cuarto de lavado equipado"],
  },
  {
    nivel: 4,
    slug: "total",
    nombre: "Total",
    descripcion: "Listo para mudarte el mismo día",
    imagen: "/paquetes/total.jpg",
    partidas: [
      "Pantalla de gran formato",
      "Refrigerador",
      "Lavadora",
      "Estufa",
      "Vale de muebles para estrenar",
    ],
  },
  {
    nivel: 5,
    slug: "arma-el-tuyo",
    nombre: "Arma el tuyo",
    descripcion: "Sin cocina. Tú escoges lo demás",
    imagen: "/paquetes/arma-el-tuyo.jpg",
    esArmable: true,
    partidas: [
      "Los climas que necesite tu depa",
      "Clósets, carpintería, lavado",
      "Muro, pantalla, electrodomésticos, vale",
      "Marca solo lo que quieras, a precio de lista",
    ],
  },
];

const IMAGEN_PROYECTO: Record<string, string> = {
  "Barrio Roble": "/interior-hero.jpg",
  "Barrio Santa Lucía": "/paquetes/total.jpg",
};

export const UNIDADES: Record<string, { torre: string; numero: string; clave: string }[]> = {
  "Barrio Roble": [
    { torre: "BR", numero: "717", clave: "DEPA 2R (tipo 717)" },
    { torre: "BR", numero: "718", clave: "DEPA 2R (tipo 717)" },
    { torre: "BR", numero: "1204", clave: "DEPA 3R-T" },
    { torre: "BR", numero: "1205", clave: "DEPA FLEX" },
    { torre: "BR", numero: "302", clave: "GARDEN VILLA" },
  ],
  "Barrio Santa Lucía": [
    { torre: "BSL", numero: "902", clave: "DEPA A" },
    { torre: "BSL", numero: "903", clave: "DEPA C" },
    { torre: "BSL", numero: "410", clave: "DEPA D" },
  ],
};

/** Desarrollador, partidas, paquetes, proyectos, prototipos, precios y unidades. */
export async function sembrarCatalogo() {
  const pissa = await prisma.desarrollador.create({
    data: {
      nombre: "PISSA",
      contacto: "obra@pissa.example",
      condicionesComerciales: "Comisión del canal 15 %. Anticipo 30 %.",
    },
  });

  const partidaPorClave = new Map<string, string>();
  for (const partida of PARTIDAS) {
    const { nombreLargo: _nombreLargo, ficha, acabados, ...datos } = partida;
    const creada = await prisma.partida.create({
      data: {
        ...datos,
        ficha: ficha as Prisma.InputJsonValue,
        acabados: (acabados ?? Prisma.DbNull) as Prisma.InputJsonValue,
      },
    });
    partidaPorClave.set(partida.clave, creada.id);
  }

  const paquetes: { id: string }[] = [];
  for (const p of PAQUETES) {
    const claves =
      p.slug === "arma-el-tuyo"
        ? PARTIDAS.filter((x) => x.armable).map((x) => x.clave)
        : PAQUETE_PARTIDAS[p.slug];
    paquetes.push(
      await prisma.paquete.create({
        data: {
          ...p,
          catalogo: { connect: claves.map((c) => ({ id: partidaPorClave.get(c)! })) },
        },
      })
    );
  }

  for (const [nombreProyecto, prototipos] of Object.entries(CATALOGO)) {
    const proyecto = await prisma.proyecto.create({
      data: {
        desarrolladorId: pissa.id,
        nombre: nombreProyecto,
        etapaPipeline: "Vendiendo",
        imagen: IMAGEN_PROYECTO[nombreProyecto],
        numeroUnidades: prototipos.length * 9,
        porcentajeAnticipo: 0.3,
        porcentajeComision: 0.15,
        minimoPlan: 50000,
        fechaEntregaUnidades: new Date("2028-03-15"),
      },
    });

    const porClave = new Map<string, string>();
    for (const proto of prototipos) {
      const creado = await prisma.prototipo.create({
        data: {
          proyectoId: proyecto.id,
          clave: proto.clave,
          superficie: proto.m2,
          recamaras: proto.rec,
          climasDefault: proto.climas,
        },
      });
      porClave.set(proto.clave, creado.id);

      // Los cuatro paquetes cerrados llevan precio fijo. «Arma el tuyo» no:
      // su precio sale de sumar las partidas que marque el comprador.
      await prisma.precio.createMany({
        data: proto.precios.map((monto, i) => ({
          prototipoId: creado.id,
          paqueteId: paquetes[i].id,
          monto,
        })),
      });

      // Incluye el precio de lista derivado de la cocina (D-04).
      await prisma.precioPartida.createMany({
        data: Object.entries(listaDePrecios(proto)).map(([clave, monto]) => ({
          prototipoId: creado.id,
          partidaId: partidaPorClave.get(clave)!,
          monto,
        })),
      });
    }

    await prisma.unidad.createMany({
      data: UNIDADES[nombreProyecto].map((u) => ({
        proyectoId: proyecto.id,
        prototipoId: porClave.get(u.clave)!,
        torre: u.torre,
        numero: u.numero,
      })),
    });
  }
}

/**
 * Un expediente ya avanzado, para que el panel no se vea vacío al abrirlo:
 * DU-001, Lucía Menchaca, BR 717 con Confort, anticipo y dos mensualidades.
 *
 * Cobra con una pasarela falsa propia aunque la aplicación ya use Stripe: el
 * seed nunca debe llamar a la pasarela real.
 */
export async function sembrarCompradorDeEjemplo(pasarela: Pasarela = crearPasarelaFalsa()) {
  const unidad = await prisma.unidad.findFirst({ where: { numero: "717", torre: "BR" } });
  const confort = await prisma.paquete.findUnique({ where: { slug: "confort" } });
  if (!unidad || !confort) throw new Error("Falta sembrar el catálogo antes del comprador de ejemplo.");

  const { plan } = await darDeAlta({
    nombre: "Lucía Menchaca",
    contacto: "81 8100 4412",
    unidadId: unidad.id,
    paqueteId: confort.id,
  });

  await registrarContrato({
    unidadId: unidad.id,
    archivoNombre: "contrato-BR717-menchaca.pdf",
    quienFirmo: "Lucía Menchaca",
    fechaFirma: new Date("2026-09-10T12:00:00"),
  });

  const exhibiciones = await prisma.exhibicion.findMany({
    where: { planId: plan.id, numero: { in: [0, 1, 2] } },
    orderBy: { numero: "asc" },
  });
  for (const ex of exhibiciones) {
    const resultado = await cobrarExhibicion(ex.id, { pasarela });
    if (resultado.estado !== "exitoso") {
      throw new Error(`El seed no pudo cobrar la exhibición ${ex.numero}: ${resultado.estado}`);
    }
  }
  return plan;
}
