import { NextRequest, NextResponse } from "next/server";
import { EstadoPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COOKIE_NAME, verificarToken } from "@/lib/sesion";
import { ENCABEZADO_APARTADO, verificarApartado } from "@/lib/apartado";

/**
 * Las rutas de la tarjeta y del anticipo son públicas porque el comprador
 * registra la suya y paga al apartar. Sin sesión de back office exigen:
 * - el token del apartado de ESE plan (`x-apartado`, lib/apartado.ts): sin
 *   él, cualquiera con el id podría cobrar el anticipo o cambiar la tarjeta
 *   (auditoría H-2);
 * - que el plan siga en cotización: la tarjeta de un plan activo se cambia
 *   desde el back office.
 */
export async function sinPermisoTarjeta(req: NextRequest, planId: string): Promise<NextResponse | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token && (await verificarToken(token))) return null;

  if (!(await verificarApartado(planId, req.headers.get(ENCABEZADO_APARTADO)))) {
    return NextResponse.json(
      { error: "El apartado expiró o no es de este navegador. Vuelve a empezar desde la unidad." },
      { status: 403 }
    );
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { estado: true } });
  if (!plan) return NextResponse.json({ error: "No se encontró el plan." }, { status: 404 });
  if (plan.estado !== EstadoPlan.COTIZADO) {
    return NextResponse.json(
      { error: "Este plan ya está activo: la tarjeta se cambia desde el back office." },
      { status: 403 }
    );
  }
  return null;
}
