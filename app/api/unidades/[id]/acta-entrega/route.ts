import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { registrarActaEntrega } from "@/lib/motor/obra";
import { ReglaError } from "@/lib/motor/errores";

const Cuerpo = z.object({
  archivoNombre: z.string().trim().min(1).max(200),
  quienFirmo: z.string().trim().min(1).max(200),
  fechaFirma: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Registra el acta de entrega firmada, requisito para ENTREGADA (actividad Q). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json({ error: "Falta el archivo, quién firmó o la fecha de firma." }, { status: 400 });
  }
  try {
    const acta = await registrarActaEntrega({
      unidadId: id,
      archivoNombre: datos.data.archivoNombre,
      quienFirmo: datos.data.quienFirmo,
      // Mediodía local: un «2026-10-05» suelto sería medianoche UTC, el día anterior en Monterrey.
      fechaFirma: new Date(`${datos.data.fechaFirma}T12:00:00`),
    });
    return NextResponse.json(acta, { status: 201 });
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
