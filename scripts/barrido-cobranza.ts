// Corre el barrido de la cobranza una vez, contra la base del .env.
// Uso: npm run cobranza:barrido
// Con Stripe de prueba en .env cobra en Stripe; sin llave, con la pasarela falsa.
import { cobrarVencidas } from "../lib/motor/barrido";
import { prisma } from "../lib/prisma";

cobrarVencidas()
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    if (r.errores.length > 0) process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
