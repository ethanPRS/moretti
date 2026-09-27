import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  const { nivel, nombre, partidas } = await req.json();
  if (!nivel || !nombre) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }
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
