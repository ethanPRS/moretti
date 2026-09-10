import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generarPlan, ReglaError } from "@/lib/motor/planes";

/** Folio correlativo del comprador. Nunca se reutiliza, aunque alguien se dé de baja. */
async function siguienteFolio() {
  const total = await prisma.comprador.count();
  return `DU-${String(total + 1).padStart(3, "0")}`;
}

export async function POST(req: NextRequest) {
  const { nombre, contacto, unidadId, paqueteId } = await req.json();
  if (!nombre || !contacto || !unidadId || !paqueteId) {
    return NextResponse.json({ error: "Faltan datos del comprador." }, { status: 400 });
  }

  try {
    const comprador = await prisma.comprador.create({
      data: { nombre, contacto, unidadId, folio: await siguienteFolio() },
    });
    const plan = await generarPlan({ compradorId: comprador.id, paqueteId });
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
