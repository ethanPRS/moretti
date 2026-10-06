import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Ids como texto: un objeto llegaría al updateMany como filtro y cerraría
// la vigencia de otros precios (auditoría 6 oct, H-7).
const Nuevo = z.object({
  prototipoId: z.string().min(1).max(40),
  paqueteId: z.string().min(1).max(40),
  monto: z.union([z.number(), z.string().max(20)]),
});

export async function POST(req: NextRequest) {
  const datos = Nuevo.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }
  const { prototipoId, paqueteId, monto } = datos.data;
  if (!monto) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }
  // El cotizador y el motor trabajan en pesos enteros (los precios de lista se
  // redondean a la centena): uno con centavos se rechaza aquí, en la entrada.
  if (!Number.isSafeInteger(Number(monto)) || Number(monto) <= 0) {
    return NextResponse.json(
      { error: "El precio va en pesos enteros, sin centavos." },
      { status: 400 }
    );
  }

  const ahora = new Date();

  const precio = await prisma.$transaction(async (tx) => {
    await tx.precio.updateMany({
      where: { prototipoId, paqueteId, vigenteHasta: null },
      data: { vigenteHasta: ahora },
    });
    return tx.precio.create({
      data: {
        prototipoId,
        paqueteId,
        monto: Number(monto),
        vigenteDesde: ahora,
      },
    });
  });

  return NextResponse.json(precio, { status: 201 });
}
