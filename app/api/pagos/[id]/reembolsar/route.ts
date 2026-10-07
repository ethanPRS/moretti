import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reembolsarPago } from "@/lib/motor/movimientos";
import { PasarelaError, ReglaError } from "@/lib/motor/planes";

/**
 * Reembolso desde el back office (sólo con sesión de admin; lo cuida proxy.ts).
 * `devolverComision` es obligatorio: si se le devuelve al comprador también
 * la comisión del canal (refund_application_fee) lo define el contrato, y
 * aquí no hay valor por defecto. Sin `montoCentavos` se reembolsa lo que
 * quede del pago.
 *
 * 200 reembolsado · 400 una regla no lo permite · 502 la pasarela no contestó.
 */
const Cuerpo = z.object({
  devolverComision: z.boolean({ error: "Falta decir si se devuelve la comisión del canal (true o false)." }),
  motivo: z.string().trim().min(1, "Falta el motivo del reembolso."),
  montoCentavos: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!datos.success) {
    return NextResponse.json({ error: datos.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }
  try {
    const hecho = await reembolsarPago({ pagoId: id, ...datos.data });
    return NextResponse.json({ ok: true, referencia: hecho.referenciaReembolso, montoCentavos: hecho.montoCentavos });
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof PasarelaError) return NextResponse.json({ error: err.message }, { status: 502 });
    throw err;
  }
}
