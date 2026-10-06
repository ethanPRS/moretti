import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { EstadoFinanciero } from "@prisma/client";
import { cambiarEstadoFinanciero, ReglaError } from "@/lib/motor/planes";

const Cuerpo = z.object({
  hacia: z.enum(EstadoFinanciero),
  motivo: z.string().max(500).optional(),
});

/** Suspender, reactivar o cancelar a mano (S1-13). El motor valida la transición. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json({ error: "Falta el estado al que se quiere pasar." }, { status: 400 });
  }
  try {
    const cambio = await cambiarEstadoFinanciero({ unidadId: id, ...datos.data });
    return NextResponse.json(cambio);
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
