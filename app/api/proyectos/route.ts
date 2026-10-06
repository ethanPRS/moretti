import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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

const Nuevo = z.object({
  desarrolladorNombre: z.string().trim().min(1, "Escribe el nombre del desarrollador."),
  nombre: z.string().trim().min(1, "Escribe el nombre del proyecto."),
  numeroUnidades: z.coerce.number().int("El número de departamentos va sin decimales.").min(1, "El proyecto necesita al menos un departamento."),
  porcentajeAnticipo: z.number().min(0).max(1, "El anticipo va de 0 a 100 %."),
  porcentajeComision: z.number().min(0).max(1, "La comisión va de 0 a 100 %."),
  minimoPlan: z.coerce.number().int("El mínimo va en pesos enteros, sin centavos.").min(0),
  fechaEntregaUnidades: z.string().nullish(),
  imagen: z.string().startsWith("/").nullish(),
});

export async function POST(req: NextRequest) {
  const datos = Nuevo.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json(
      { error: datos.error.issues[0]?.message ?? "Revisa los datos del proyecto." },
      { status: 400 }
    );
  }
  const d = datos.data;

  // Un desarrollador con varios proyectos no se duplica.
  const desarrollador =
    (await prisma.desarrollador.findFirst({
      where: { nombre: { equals: d.desarrolladorNombre, mode: "insensitive" } },
    })) ?? (await prisma.desarrollador.create({ data: { nombre: d.desarrolladorNombre } }));

  const proyecto = await prisma.proyecto.create({
    data: {
      desarrolladorId: desarrollador.id,
      nombre: d.nombre,
      numeroUnidades: d.numeroUnidades,
      porcentajeAnticipo: d.porcentajeAnticipo,
      porcentajeComision: d.porcentajeComision,
      minimoPlan: d.minimoPlan,
      // Mediodía local: una fecha suelta en UTC se recorre al día anterior en Monterrey.
      fechaEntregaUnidades: d.fechaEntregaUnidades ? new Date(`${d.fechaEntregaUnidades}T12:00:00`) : null,
      imagen: d.imagen ?? null,
    },
  });

  return NextResponse.json(proyecto, { status: 201 });
}
