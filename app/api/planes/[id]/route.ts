import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      comprador: { include: { unidad: { include: { proyecto: true, prototipo: true } } } },
      paquete: true,
      precio: true,
      exhibiciones: { orderBy: { numero: "asc" } },
    },
  });
  if (!plan) {
    return NextResponse.json({ error: "Plan no encontrado." }, { status: 404 });
  }
  return NextResponse.json(plan);
}
