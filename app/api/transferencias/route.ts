import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { autorizarTransferencia } from "@/lib/motor/transferencias";
import { ReglaError } from "@/lib/motor/errores";

const Cuerpo = z.object({
  proyectoId: z.string().min(1).max(40),
  autorizadaPor: z.string().trim().min(1).max(120),
});

/** Ana Cris autoriza pagar a Moretti lo retenido de un proyecto (D-34). */
export async function POST(req: NextRequest) {
  const datos = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!datos.success) return NextResponse.json({ error: "Falta el proyecto o quién autoriza." }, { status: 400 });
  try {
    return NextResponse.json(await autorizarTransferencia(datos.data), { status: 201 });
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
