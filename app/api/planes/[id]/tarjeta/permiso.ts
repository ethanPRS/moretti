import { NextRequest, NextResponse } from "next/server";
import { EstadoPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COOKIE_NAME, verificarToken } from "@/lib/sesion";

/**
 * Las rutas de la tarjeta son públicas porque el comprador registra la suya
 * al apartar. Sin sesión de back office sólo sirven mientras el plan es
 * cotización: si no, cualquiera con el id podría cambiar la tarjeta a la que
 * se cargan las mensualidades de un plan activo.
 */
export async function sinPermisoTarjeta(req: NextRequest, planId: string): Promise<NextResponse | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token && (await verificarToken(token))) return null;

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
