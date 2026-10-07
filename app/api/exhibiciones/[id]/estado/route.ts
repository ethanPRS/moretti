import { NextResponse } from "next/server";
import { estadoCobro, ReglaError } from "@/lib/motor/planes";

/**
 * Lo consulta el navegador mientras espera a que el webhook aplique un cobro
 * pendiente. Sólo lee: si está pagada, con qué referencia y cuántos rechazos
 * lleva. Pública para que el comprador la vea al apartar; no expone montos
 * ni datos personales.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await estadoCobro(id), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
