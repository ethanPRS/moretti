import { NextResponse } from "next/server";
import { cobrarExhibicion, PasarelaError, ReglaError } from "@/lib/motor/planes";

/**
 * 200 cobrado · 202 pendiente (el banco pidió autenticación) · 402 rechazado
 * por el banco · 400 una regla no lo permite · 502 la pasarela no contestó.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const resultado = await cobrarExhibicion(id);
    switch (resultado.estado) {
      case "exitoso":
        return NextResponse.json({ ok: true, referencia: resultado.referencia });
      case "pendiente":
        return NextResponse.json(
          { pendiente: true, mensaje: resultado.mensaje, referencia: resultado.referencia },
          { status: 202 }
        );
      case "rechazado":
        return NextResponse.json(
          { error: resultado.mensaje, codigo: resultado.codigo },
          { status: 402 }
        );
    }
  } catch (err) {
    if (err instanceof ReglaError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof PasarelaError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}
