import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const proyectos = await prisma.proyecto.findMany({
    include: {
      desarrollador: true,
      unidades: true,
      prototipos: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(proyectos);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    desarrolladorNombre,
    nombre,
    numeroUnidades,
    porcentajeAnticipo,
    porcentajeComision,
  } = body;

  if (!desarrolladorNombre || !nombre || !numeroUnidades || !porcentajeComision) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }

  const desarrollador = await prisma.desarrollador.create({
    data: { nombre: desarrolladorNombre },
  });

  const proyecto = await prisma.proyecto.create({
    data: {
      desarrolladorId: desarrollador.id,
      nombre,
      numeroUnidades: Number(numeroUnidades),
      porcentajeAnticipo: porcentajeAnticipo ? Number(porcentajeAnticipo) : 0.1,
      porcentajeComision: Number(porcentajeComision),
    },
  });

  return NextResponse.json(proyecto, { status: 201 });
}
