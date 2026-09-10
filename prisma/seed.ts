import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Catálogo real tomado del cotizador de la maqueta del sitio. */
const CATALOGO: Record<
  string,
  { clave: string; m2: number; rec: number; precios: [number, number, number, number] }[]
> = {
  "Barrio Roble": [
    { clave: "DEPA 2R (tipo 717)", m2: 57.7, rec: 2, precios: [147300, 176200, 195600, 375800] },
    { clave: "DEPA 2R-T", m2: 60.0, rec: 2, precios: [145700, 174700, 192400, 372500] },
    { clave: "DEPA 3R-T", m2: 78.0, rec: 3, precios: [212700, 251300, 270700, 450800] },
    { clave: "DEPA FLEX", m2: 70.0, rec: 3, precios: [169500, 208000, 225700, 405900] },
    { clave: "DEPA DUPLEX", m2: 95.0, rec: 2, precios: [213600, 242500, 261900, 442000] },
    { clave: "GARDEN VILLA", m2: 63.0, rec: 2, precios: [186200, 215100, 234500, 414700] },
    { clave: "GARDEN VILLA FLEX", m2: 87.1, rec: 3, precios: [209200, 247800, 267200, 447300] },
  ],
  "Barrio Santa Lucía": [
    { clave: "DEPA A", m2: 58.0, rec: 2, precios: [178300, 207200, 224900, 405100] },
    { clave: "DEPA B", m2: 52.0, rec: 2, precios: [98900, 127800, 145500, 325600] },
    { clave: "DEPA C", m2: 55.0, rec: 2, precios: [136500, 165400, 183100, 363200] },
    { clave: "DEPA D", m2: 33.0, rec: 1, precios: [76200, 85800, 101900, 282000] },
    { clave: "DEPA E", m2: 38.0, rec: 1, precios: [77500, 87200, 103200, 283300] },
    { clave: "DEPA F", m2: 44.0, rec: 1, precios: [91600, 110900, 126900, 307100] },
  ],
};

const PAQUETES = [
  { nivel: 1, nombre: "Casa Lista", partidas: ["Cocina integral", "Clósets", "Minisplits"] },
  { nivel: 2, nombre: "Confort", partidas: ["Todo Casa Lista", "Panel PVC", "Cuarto de lavado"] },
  { nivel: 3, nombre: "Plus", partidas: ["Todo Confort", "Estufa", "Refrigerador", "Lavadora"] },
  { nivel: 4, nombre: "Total", partidas: ["Todo Plus", "Pantalla", "Vale de mueblería"] },
];

const UNIDADES: Record<string, { torre: string; numero: string; clave: string }[]> = {
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

async function main() {
  const pissa = await prisma.desarrollador.create({
    data: {
      nombre: "PISSA",
      contacto: "obra@pissa.example",
      condicionesComerciales: "Comisión del canal 15 %. Anticipo 30 %.",
    },
  });

  const paquetes: { id: string }[] = [];
  for (const p of PAQUETES) {
    paquetes.push(await prisma.paquete.create({ data: p }));
  }

  for (const [nombreProyecto, prototipos] of Object.entries(CATALOGO)) {
    const proyecto = await prisma.proyecto.create({
      data: {
        desarrolladorId: pissa.id,
        nombre: nombreProyecto,
        etapaPipeline: "Vendiendo",
        numeroUnidades: prototipos.length * 9,
        porcentajeAnticipo: 0.3,
        porcentajeComision: 0.15,
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
        },
      });
      porClave.set(proto.clave, creado.id);

      await prisma.precio.createMany({
        data: proto.precios.map((monto, i) => ({
          prototipoId: creado.id,
          paqueteId: paquetes[i].id,
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

  const unidades = await prisma.unidad.count();
  console.log(
    `Seed listo · PISSA · ${Object.keys(CATALOGO).length} proyectos · ${PAQUETES.length} paquetes · ${unidades} unidades`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
