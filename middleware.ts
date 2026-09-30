/**
 * Middleware de Next.js — protege el back office.
 *
 * Regla: todo /admin/* requiere sesión de administrador,
 * salvo /admin/login (y sus rutas de API de autenticación).
 *
 * Si la cookie falta o el token expiró → redirige a /admin/login.
 */

import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verificarToken } from "@/lib/sesion";

export const config = {
  matcher: ["/admin/:path*"],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rutas públicas dentro de /admin (login + apis de auth)
  const publica =
    pathname === "/admin/login" ||
    pathname.startsWith("/api/admin/login") ||
    pathname.startsWith("/api/admin/logout");

  if (publica) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const valido = token ? await verificarToken(token) : false;

  if (!valido) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    // Guardar destino para redirigir después del login
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
