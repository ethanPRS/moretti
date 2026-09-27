import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { elegirAcabado } from "@/lib/motor/acabados";
import { ReglaError } from "@/lib/motor/errores";

const Cuerpo = z.object({ acabado: z.string().min(1) });

/** Elige el acabado de una partida del plan (S1-05). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json({ error: "Falta el acabado que se eligió." }, { status: 400 });
  }
  try {
    const renglon = await elegirAcabado({ renglonId: id, acabado: datos.data.acabado });
    return NextResponse.json({ acabado: renglon.acabado });
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
