import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { proyectoId, prototipoId, torre, numero } = await req.json();
  if (!proyectoId || !prototipoId || !torre || !numero) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }
  const unidad = await prisma.unidad.create({
    data: { proyectoId, prototipoId, torre, numero },
  });
  return NextResponse.json(unidad, { status: 201 });
}
