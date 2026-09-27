import { prisma } from "../lib/prisma";
import { CATALOGO, PARTIDAS } from "./catalogo";
import { PAQUETES, sembrarCatalogo, sembrarCompradorDeEjemplo } from "./sembrar";

async function main() {
  await sembrarCatalogo();
  await sembrarCompradorDeEjemplo();

  const unidades = await prisma.unidad.count();
  console.log(
    `Seed listo · PISSA · ${Object.keys(CATALOGO).length} proyectos · ${PAQUETES.length} paquetes · ${PARTIDAS.length} partidas · ${unidades} unidades`
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
