import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PasarelaError, ReglaError } from "@/lib/motor/planes";
import {
  ejecutarAdelanto,
  ejecutarLiquidacion,
  previsualizarAdelanto,
  previsualizarLiquidacion,
} from "@/lib/motor/versiones";

const Cuerpo = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("adelanto"), monto: z.string().trim().min(1).max(20), confirmar: z.boolean() }),
  z.object({ accion: z.literal("liquidacion"), confirmar: z.boolean() }),
]);

/**
 * Adelanto o liquidación anticipada (actividad R). Con `confirmar: false`
 * sólo devuelve la vista previa; con `true` crea la versión nueva y cobra.
 * 200 cobrado · 202 pendiente · 402 rechazado (el plan se restituyó) ·
 * 400 una regla no lo permite · 502 la pasarela no contestó.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json({ error: "Falta la acción o el monto del adelanto." }, { status: 400 });
  }
  const d = datos.data;
  try {
    if (!d.confirmar) {
      const vista = d.accion === "adelanto" ? await previsualizarAdelanto(id, d.monto) : await previsualizarLiquidacion(id);
      return NextResponse.json({ vista });
    }
    const resultado =
      d.accion === "adelanto"
        ? await ejecutarAdelanto({ planId: id, monto: d.monto })
        : await ejecutarLiquidacion({ planId: id });
    switch (resultado.estado) {
      case "exitoso":
        return NextResponse.json({ ok: true, version: resultado.version });
      case "pendiente":
        return NextResponse.json({ pendiente: true, mensaje: resultado.mensaje, version: resultado.version }, { status: 202 });
      case "rechazado":
        return NextResponse.json(
          { error: `${resultado.mensaje} El calendario volvió a quedar como estaba (versión ${resultado.version}).` },
          { status: 402 }
        );
    }
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof PasarelaError) return NextResponse.json({ error: err.message }, { status: 502 });
    throw err;
  }
}
