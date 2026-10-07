import { NextRequest, NextResponse } from "next/server";
import { prepararTarjeta, ReglaError } from "@/lib/motor/planes";
import { sinPermisoTarjeta } from "./permiso";

/**
 * Prepara la captura de la tarjeta del comprador (S1-06): devuelve el secreto
 * para el Payment Element. El número de la tarjeta nunca pasa por aquí.
 * Exige `consentimiento: true` (la casilla de los cargos futuros).
 *
 * 200 listo · 400 falta la autorización o una regla no lo permite ·
 * 403 plan activo sin sesión · 502 la pasarela no contestó.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { consentimiento } = (await req.json().catch(() => ({}))) as { consentimiento?: unknown };

  const bloqueo = await sinPermisoTarjeta(req, id);
  if (bloqueo) return bloqueo;

  try {
    const { clientSecret } = await prepararTarjeta({ planId: id, consentimiento: consentimiento === true });
    return NextResponse.json({ clientSecret });
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("No se pudo preparar la captura de la tarjeta:", err);
    return NextResponse.json(
      { error: "No se pudo preparar la captura de la tarjeta. Intenta de nuevo en un momento." },
      { status: 502 }
    );
  }
}
