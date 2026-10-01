/**
 * POST /api/admin/login
 *
 * Verifica la contraseña contra ADMIN_PASSWORD_HASH (scrypt) y emite la
 * cookie de sesión. Cinco fallas desde la misma IP bloquean 15 minutos.
 * Devuelve JSON: { ok: true } o { ok: false, error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { crearToken, cookieOpciones } from "@/lib/sesion";
import { verificarContrasena } from "@/lib/contrasena";
import { anotarFalla, bloqueadoPor, limpiar } from "@/lib/limite-intentos";

function ipDe(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export async function POST(req: NextRequest) {
  const ip = ipDe(req);
  const espera = bloqueadoPor(ip);
  if (espera > 0) {
    const minutos = Math.ceil(espera / 60000);
    return NextResponse.json(
      { ok: false, error: `Demasiados intentos. Vuelve a intentar en ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(espera / 1000)) } }
    );
  }

  const guardado = process.env.ADMIN_PASSWORD_HASH;
  if (!guardado || !process.env.SESSION_SECRET) {
    console.error("Falta ADMIN_PASSWORD_HASH o SESSION_SECRET en .env");
    return NextResponse.json({ ok: false, error: "El acceso no está configurado en el servidor." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const contrasena = (body !== null && typeof body === "object" && !Array.isArray(body))
    ? (body as Record<string, unknown>)["contrasena"]
    : undefined;
  const correcta =
    typeof contrasena === "string" && contrasena.length <= 200 && (await verificarContrasena(contrasena, guardado));

  if (!correcta) {
    anotarFalla(ip);
    return NextResponse.json({ ok: false, error: "Contraseña incorrecta." }, { status: 401 });
  }

  limpiar(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...cookieOpciones(), value: await crearToken() });
  return res;
}
