import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const Nuevo = z.object({
  proyectoId: z.string().min(1, "Falta el proyecto."),
  clave: z.string().trim().min(1, "Escribe la clave del prototipo, por ejemplo «DEPA 2R (tipo 717)»."),
  superficie: z.coerce.number().positive("La superficie va en m² y debe ser mayor a cero."),
  recamaras: z.coerce.number().int("Las recámaras van sin decimales.").min(0, "Las recámaras no pueden ser negativas."),
  climasDefault: z.coerce.number().int().min(0).max(9).optional(),
});

export async function POST(req: NextRequest) {
  const datos = Nuevo.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json({ error: datos.error.issues[0]?.message ?? "Revisa los datos del prototipo." }, { status: 400 });
  }
  const d = datos.data;
  try {
    const prototipo = await prisma.prototipo.create({
      data: {
        proyectoId: d.proyectoId,
        clave: d.clave,
        superficie: d.superficie,
        recamaras: d.recamaras,
        // Un clima por espacio: la sala y cada recámara (spec §4).
        climasDefault: d.climasDefault ?? d.recamaras + 1,
      },
    });
    return NextResponse.json(prototipo, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: `Ya existe un prototipo con la clave «${d.clave}» en este proyecto.` }, { status: 400 });
    }
    throw err;
  }
}
