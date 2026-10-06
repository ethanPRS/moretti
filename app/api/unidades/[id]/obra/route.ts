import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { EstadoInstalacion, EstadoOperativo } from "@prisma/client";
import { avanzarEstadoOperativo, avanzarInstalacion } from "@/lib/motor/obra";
import { ReglaError } from "@/lib/motor/errores";

const Cuerpo = z.discriminatedUnion("maquina", [
  z.object({ maquina: z.literal("operativa"), hacia: z.enum(EstadoOperativo) }),
  z.object({ maquina: z.literal("instalacion"), hacia: z.enum(EstadoInstalacion) }),
]);

/** Avanza la operativa o la instalación (actividad Q). El motor valida y dice qué falta. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json({ error: "Falta la máquina o el estado al que se quiere pasar." }, { status: 400 });
  }
  try {
    const cambio =
      datos.data.maquina === "operativa"
        ? await avanzarEstadoOperativo({ unidadId: id, hacia: datos.data.hacia })
        : await avanzarInstalacion({ unidadId: id, hacia: datos.data.hacia });
    return NextResponse.json(cambio);
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
