import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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

const Cambios = z.object({
  nombre: z.string().trim().min(1, "El proyecto necesita un nombre."),
  numeroUnidades: z.coerce.number().int().min(1, "El proyecto necesita al menos un departamento."),
  porcentajeAnticipo: z.number().min(0).max(1, "El anticipo va de 0 a 100 %."),
  porcentajeComision: z.number().min(0).max(1, "La comisión va de 0 a 100 %."),
  minimoPlan: z.coerce.number().int("El mínimo va en pesos enteros, sin centavos.").min(0),
  fechaEntregaUnidades: z.string().nullish(),
  imagen: z.string().startsWith("/").nullish(),
  // La cuenta conectada de Moretti para este proyecto: ahí cae el cargo directo.
  stripeConnectedAccountId: z
    .string()
    .trim()
    .regex(/^acct_[A-Za-z0-9]+$/, "La cuenta conectada de Stripe empieza con acct_.")
    .nullish()
    .or(z.literal("")),
});

/**
 * Edita los datos del proyecto. Los planes ya generados guardaron su monto y
 * sus exhibiciones, así que un cambio de anticipo o comisión no los mueve.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = Cambios.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json({ error: datos.error.issues[0]?.message ?? "Revisa los datos." }, { status: 400 });
  }
  const d = datos.data;
  const proyecto = await prisma.proyecto.update({
    where: { id },
    data: {
      nombre: d.nombre,
      numeroUnidades: d.numeroUnidades,
      porcentajeAnticipo: d.porcentajeAnticipo,
      porcentajeComision: d.porcentajeComision,
      minimoPlan: d.minimoPlan,
      fechaEntregaUnidades: d.fechaEntregaUnidades ? new Date(`${d.fechaEntregaUnidades}T12:00:00`) : null,
      imagen: d.imagen ?? null,
      stripeConnectedAccountId: d.stripeConnectedAccountId || null,
    },
  });
  return NextResponse.json(proyecto);
}
