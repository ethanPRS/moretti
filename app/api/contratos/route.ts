import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const Nuevo = z.object({
  unidadId: z.string().min(1).max(40),
  archivoNombre: z.string().trim().min(1).max(200),
  quienFirmo: z.string().trim().min(1).max(200),
  fechaFirma: z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/),
});
import { registrarContrato, ReglaError } from "@/lib/motor/planes";

/**
 * Un "2026-09-10" suelto lo interpreta Date como medianoche UTC, que en
 * Monterrey es el día anterior. Se ancla al mediodía local para que la
 * fecha de firma no se recorra.
 */
function fechaLocal(valor: string) {
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor);
  return new Date(soloFecha ? `${valor}T12:00:00` : valor);
}

export async function POST(req: NextRequest) {
  const datos = Nuevo.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json({ error: "Falta el archivo, quién firmó o la fecha de firma." }, { status: 400 });
  }
  const { unidadId, archivoNombre, quienFirmo, fechaFirma } = datos.data;
  if (!unidadId || !archivoNombre || !quienFirmo || !fechaFirma) {
    return NextResponse.json(
      { error: "Falta el archivo, quién firmó o la fecha de firma." },
      { status: 400 }
    );
  }

  try {
    const contrato = await registrarContrato({
      unidadId,
      archivoNombre,
      quienFirmo,
      fechaFirma: fechaLocal(fechaFirma),
    });
    return NextResponse.json(contrato, { status: 201 });
  } catch (err) {
    if (err instanceof ReglaError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
