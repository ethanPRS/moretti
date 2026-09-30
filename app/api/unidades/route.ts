import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const Nueva = z.object({
  proyectoId: z.string().min(1, "Falta el proyecto."),
  prototipoId: z.string().min(1, "Elige el prototipo de la unidad."),
  torre: z.string().trim().min(1, "Escribe la torre, por ejemplo «A»."),
  numero: z.string().trim().min(1, "Escribe el número del departamento, por ejemplo «1204»."),
  /** Opcional: da de alta del número al `hasta` (ej. 1201 a 1210). */
  hasta: z.string().trim().optional(),
});

/** Una unidad, o un rango de números seguidos en la misma torre. */
export async function POST(req: NextRequest) {
  const datos = Nueva.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json({ error: datos.error.issues[0]?.message ?? "Revisa los datos de la unidad." }, { status: 400 });
  }
  const d = datos.data;
  const prototipo = await prisma.prototipo.findFirst({ where: { id: d.prototipoId, proyectoId: d.proyectoId } });
  if (!prototipo) return NextResponse.json({ error: "Ese prototipo no es de este proyecto." }, { status: 400 });

  let numeros = [d.numero];
  if (d.hasta) {
    const desde = Number(d.numero);
    const hasta = Number(d.hasta);
    if (!Number.isInteger(desde) || !Number.isInteger(hasta) || hasta < desde) {
      return NextResponse.json({ error: "Para un rango, «del» y «al» van en números y «al» es mayor. Ej. del 1201 al 1210." }, { status: 400 });
    }
    if (hasta - desde >= 200) {
      return NextResponse.json({ error: "Son demasiadas unidades de una vez: máximo 200 por rango." }, { status: 400 });
    }
    numeros = Array.from({ length: hasta - desde + 1 }, (_, i) => String(desde + i));
  }

  const existentes = await prisma.unidad.findMany({
    where: { proyectoId: d.proyectoId, torre: d.torre, numero: { in: numeros } },
    select: { numero: true },
  });
  if (existentes.length > 0) {
    const lista = existentes.map((u) => u.numero).slice(0, 5).join(", ");
    return NextResponse.json({ error: `Ya existen en la torre ${d.torre}: ${lista}${existentes.length > 5 ? "…" : ""}.` }, { status: 400 });
  }

  const creadas = await prisma.unidad.createMany({
    data: numeros.map((numero) => ({ proyectoId: d.proyectoId, prototipoId: d.prototipoId, torre: d.torre, numero })),
  });
  return NextResponse.json({ creadas: creadas.count }, { status: 201 });
}
