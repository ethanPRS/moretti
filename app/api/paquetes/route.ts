import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Tipos estrictos: un objeto donde va un texto llegaría a Prisma como
// filtro u operador (auditoría 6 oct, H-7).
const Nuevo = z.object({
  nivel: z.coerce.number().int().min(1).max(99),
  nombre: z.string().trim().min(1).max(80),
  partidas: z.union([z.array(z.string().trim().max(200)).max(40), z.string().max(4000)]).optional(),
});

export async function GET() {
  const paquetes = await prisma.paquete.findMany({ orderBy: { nivel: "asc" } });
  return NextResponse.json(paquetes);
}

/** El slug es la dirección pública del paquete: /paquetes/<slug>. */
function slugify(nombre: string) {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(req: NextRequest) {
  const datos = Nuevo.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }
  const { nivel, nombre, partidas } = datos.data;
  const paquete = await prisma.paquete.create({
    data: {
      nivel: Number(nivel),
      slug: slugify(nombre),
      nombre,
      partidas: Array.isArray(partidas)
        ? partidas
        : String(partidas || "")
            .split(",")
            .map((p: string) => p.trim())
            .filter(Boolean),
    },
  });
  return NextResponse.json(paquete, { status: 201 });
}
