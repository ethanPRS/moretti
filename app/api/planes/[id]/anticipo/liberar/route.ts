import { NextResponse } from "next/server";
import { liberarAnticipo, PasarelaError, ReglaError } from "@/lib/motor/planes";

/**
 * Libera el anticipo autorizado sin cobrarlo (STRIPE_CAPTURE_METHOD=manual).
 * Sólo con sesión de admin. 200 liberado · 400 regla · 502 pasarela.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await liberarAnticipo(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof PasarelaError) return NextResponse.json({ error: err.message }, { status: 502 });
    throw err;
  }
}
