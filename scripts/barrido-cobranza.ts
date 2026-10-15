// Corre el barrido de la cobranza una vez, contra la base del .env.
// Uso: npm run cobranza:barrido
// Con Stripe de prueba en .env cobra en Stripe; sin llave, con la pasarela falsa.
// Después de cobrar deja los avisos de tarjetas por vencer (E4).
import { cobrarVencidas } from "../lib/motor/barrido";
import { avisarTarjetasPorVencer } from "../lib/motor/avisos-tarjeta";
import { prisma } from "../lib/prisma";

async function barrer() {
  const r = await cobrarVencidas();
  const avisosTarjeta = await avisarTarjetasPorVencer();
  console.log(JSON.stringify({ ...r, avisosTarjeta }, null, 2));
  if (r.errores.length > 0) process.exitCode = 1;
}

barrer().finally(() => prisma.$disconnect());
