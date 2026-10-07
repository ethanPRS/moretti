import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cobrarVencidas } from "@/lib/motor/barrido";

/**
 * Dispara el barrido de la cobranza (lib/motor/barrido.ts). Lo llama un cron
 * —Vercel Cron manda GET con `Authorization: Bearer <CRON_SECRET>`— o
 * cualquiera que tenga el secreto (curl, GitHub Actions). Sin CRON_SECRET en
 * el entorno, la ruta no hace nada.
 *
 * Correrla dos veces seguidas es seguro: el barrido no cobra dos veces.
 *
 * 200 con el resumen · 401 sin el secreto · 503 sin CRON_SECRET configurado.
 */
export async function GET(req: NextRequest) {
  return barrer(req);
}

export async function POST(req: NextRequest) {
  return barrer(req);
}

async function barrer(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || secreto.length < 16) {
    return NextResponse.json(
      { error: "El barrido no está configurado: falta CRON_SECRET (mínimo 16 caracteres)." },
      { status: 503 }
    );
  }
  if (!autorizado(req.headers.get("authorization"), secreto)) {
    return NextResponse.json({ error: "Falta el secreto del cron." }, { status: 401 });
  }

  const resultado = await cobrarVencidas();
  if (resultado.errores.length > 0 || resultado.pendientesSinConfirmar.length > 0) {
    console.warn("Barrido de cobranza con avisos:", JSON.stringify(resultado));
  }
  return NextResponse.json(resultado);
}

function autorizado(encabezado: string | null, secreto: string) {
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(encabezado ?? "");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}
