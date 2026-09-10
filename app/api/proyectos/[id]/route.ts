import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const proyecto = await prisma.proyecto.findUnique({
    where: { id },
    include: {
      desarrollador: true,
      prototipos: { include: { precios: { include: { paquete: true } } } },
      unidades: {
        include: { prototipo: true, comprador: { include: { planes: true } } },
      },
    },
  });
  if (!proyecto) {
    return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
  }
  return NextResponse.json(proyecto);
}
