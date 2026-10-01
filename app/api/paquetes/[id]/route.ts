import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const Cambios = z.object({
  nombre: z.string().trim().min(1, "El paquete necesita un nombre."),
  descripcion: z.string().trim().max(240, "La descripción va en una o dos líneas (240 caracteres).").nullish(),
  partidas: z.array(z.string().trim().min(1)).max(20),
  imagen: z.string().startsWith("/").nullish(),
});

/**
 * Edita lo que se muestra del paquete: nombre, descripción, renglones de la
 * tarjeta e imagen. El slug no cambia (es su dirección pública) y el precio y
 * el contenido cotizable se editan en otro lado: los planes guardan su copia.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = Cambios.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json({ error: datos.error.issues[0]?.message ?? "Revisa los datos del paquete." }, { status: 400 });
  }
  const d = datos.data;
  const paquete = await prisma.paquete.update({
    where: { id },
    data: { nombre: d.nombre, descripcion: d.descripcion || null, partidas: d.partidas, imagen: d.imagen ?? null },
  });
  return NextResponse.json(paquete);
}
