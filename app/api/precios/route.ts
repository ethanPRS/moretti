import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { prototipoId, paqueteId, monto } = await req.json();
  if (!prototipoId || !paqueteId || !monto) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
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
