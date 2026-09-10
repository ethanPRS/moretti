import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { proyectoId, clave, superficie, recamaras } = await req.json();
  if (!proyectoId || !clave || !superficie || !recamaras) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }
  const prototipo = await prisma.prototipo.create({
    data: {
      proyectoId,
      clave,
      superficie: Number(superficie),
      recamaras: Number(recamaras),
    },
  });
  return NextResponse.json(prototipo, { status: 201 });
}
