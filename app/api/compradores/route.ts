import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { darDeAlta, ReglaError } from "@/lib/motor/planes";

const Alta = z.object({
  nombre: z.string().trim().min(1),
  contacto: z.string().trim().min(1),
  unidadId: z.string().min(1),
  paqueteId: z.string().min(1),
  /** Clave de partida → cantidad. Sin ella, el paquete cerrado va tal cual. */
  canasta: z.record(z.string(), z.number().int().min(0)).optional(),
});

export async function POST(req: NextRequest) {
  const datos = Alta.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json(
      { error: "Faltan datos del comprador o la canasta no es válida." },
      { status: 400 }
    );
  }

  try {
    const { comprador, plan } = await darDeAlta(datos.data);
    return NextResponse.json({ comprador, plan }, { status: 201 });
  } catch (err) {
    if (err instanceof ReglaError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && (err as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Esta unidad ya tiene un comprador registrado." },
        { status: 400 }
      );
    }
    throw err;
  }
}
