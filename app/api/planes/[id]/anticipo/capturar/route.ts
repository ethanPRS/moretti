import { NextResponse } from "next/server";
import { capturarAnticipo, PasarelaError, ReglaError } from "@/lib/motor/planes";

/**
 * Cobra el anticipo que quedó autorizado (STRIPE_CAPTURE_METHOD=manual).
 * Sólo con sesión de admin.
 *
 * 200 cobrado · 202 pendiente · 402 rechazado · 400 regla · 502 pasarela.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const r = await capturarAnticipo(id);
    if (r.estado === "exitoso") return NextResponse.json({ ok: true, referencia: r.referencia });
    if (r.estado === "pendiente") return NextResponse.json({ pendiente: true, mensaje: r.mensaje }, { status: 202 });
    return NextResponse.json({ error: r.mensaje, codigo: r.codigo }, { status: 402 });
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof PasarelaError) return NextResponse.json({ error: err.message }, { status: 502 });
    throw err;
  }
}
