import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { marcarComprobanteEmitido } from "@/lib/motor/comprobantes";
import { ReglaError } from "@/lib/motor/errores";

const Cuerpo = z.object({ folioFiscal: z.string().trim().min(1).max(60) });

/** Cierra un pendiente fiscal con el folio del CFDI (actividad S). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!datos.success) return NextResponse.json({ error: "Falta el folio fiscal." }, { status: 400 });
  try {
    return NextResponse.json(await marcarComprobanteEmitido({ id, folioFiscal: datos.data.folioFiscal }));
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
