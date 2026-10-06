import { NextRequest, NextResponse } from "next/server";
import { cobrarAnticipo, PasarelaError, ReglaError } from "@/lib/motor/planes";

/**
 * Cobra el anticipo de un plan recién apartado desde el sitio.
 * 200 cobrado · 202 el banco pidió autenticación · 402 rechazado ·
 * 400 una regla no lo permite · 502 la pasarela no contestó.
 *
 * Hoy va con la pasarela falsa (lib/pasarela/index.ts); con Stripe, la
 * tarjeta la captura el Payment Element y aquí sólo llega el plan.
 */
export async function POST(req: NextRequest) {
  const { planId } = (await req.json().catch(() => ({}))) as { planId?: string };
  if (!planId) return NextResponse.json({ error: "Falta el plan." }, { status: 400 });

  try {
    const r = await cobrarAnticipo(planId);
    switch (r.estado) {
      case "exitoso":
        return NextResponse.json({ ok: true, referencia: r.referencia });
      case "pendiente":
        return NextResponse.json({ pendiente: true, mensaje: r.mensaje }, { status: 202 });
      case "rechazado":
        return NextResponse.json({ error: r.mensaje, codigo: r.codigo }, { status: 402 });
    }
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof PasarelaError) return NextResponse.json({ error: err.message }, { status: 502 });
    throw err;
  }
}
