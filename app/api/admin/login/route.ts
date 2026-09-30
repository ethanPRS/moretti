/**
 * POST /api/admin/login
 *
 * Verifica la contraseña contra ADMIN_PASSWORD y emite una cookie de sesión.
 * Devuelve JSON: { ok: true } o { ok: false, error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { crearToken, cookieOpciones } from "@/lib/sesion";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { contrasena } = body as { contrasena?: string };

    const correcta = process.env.ADMIN_PASSWORD;
    if (!correcta) {
      console.error("ADMIN_PASSWORD no está configurado en .env");
      return NextResponse.json(
        { ok: false, error: "Servidor mal configurado." },
        { status: 500 }
      );
    }

    // Comparación de longitud constante (timing-safe para prototipo)
    if (!contrasena || contrasena !== correcta) {
      // Pequeño delay para dificultar ataques de fuerza bruta en dev
      await new Promise((r) => setTimeout(r, 300));
      return NextResponse.json(
        { ok: false, error: "Contraseña incorrecta." },
        { status: 401 }
      );
    }

    const token = await crearToken();
    const res = NextResponse.json({ ok: true });
    res.cookies.set({ ...cookieOpciones(), value: token });
    return res;
  } catch (err) {
    console.error("Error en /api/admin/login:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno." },
      { status: 500 }
    );
  }
}
