import { NextRequest, NextResponse } from "next/server";
import { registrarTarjeta, ReglaError } from "@/lib/motor/planes";
import { sinPermisoTarjeta } from "../permiso";

/**
 * El navegador terminó de capturar la tarjeta y manda el id del SetupIntent.
 * El servidor lo verifica con la pasarela antes de registrarla: el navegador
 * no es fuente de verdad. El webhook `setup_intent.succeeded` hace lo mismo
 * por si esta llamada no llega.
 *
 * 200 registrada · 400 no quedó guardada o no es de este comprador ·
 * 403 plan activo sin sesión · 502 la pasarela no contestó.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { setupIntentId } = (await req.json().catch(() => ({}))) as { setupIntentId?: unknown };
  if (typeof setupIntentId !== "string" || !setupIntentId) {
    return NextResponse.json({ error: "Falta la referencia de la tarjeta capturada." }, { status: 400 });
  }

  const bloqueo = await sinPermisoTarjeta(req, id);
  if (bloqueo) return bloqueo;

  try {
    const tarjeta = await registrarTarjeta({ planId: id, referenciaPreparacion: setupIntentId });
    return NextResponse.json({ ok: true, descripcion: tarjeta.descripcion });
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("No se pudo verificar la tarjeta capturada:", err);
    return NextResponse.json(
      { error: "No se pudo verificar la tarjeta. Si el cargo de prueba no aparece, vuelve a capturarla." },
      { status: 502 }
    );
  }
}
