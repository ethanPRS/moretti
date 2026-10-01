/**
 * Proxy de Next.js (antes «middleware») — protege el back office y su API.
 *
 * - /admin/* requiere sesión, salvo /admin/login. Sin sesión → al login.
 * - /api/* requiere sesión, salvo lo que usa el sitio público (apartar y
 *   ver imágenes) y el login. Sin sesión → 401 en JSON.
 * - Toda petición que cambia algo (POST, PATCH, PUT, DELETE) a /api debe
 *   venir de este mismo sitio (encabezado Origin): freno a CSRF.
 */

import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verificarToken } from "@/lib/sesion";

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};

const API_PUBLICA: { metodo: string; ruta: RegExp }[] = [
  { metodo: "POST", ruta: /^\/api\/admin\/(login|logout)$/ },
  { metodo: "POST", ruta: /^\/api\/apartar(\/anticipo)?$/ },
  { metodo: "GET", ruta: /^\/api\/imagenes\/[^/]+$/ },
];

const CAMBIA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function mismoOrigen(req: NextRequest) {
  const origen = req.headers.get("origin");
  // Sin Origin (curl, servidor a servidor) no hay navegador que engañar;
  // la sesión sigue haciendo falta para lo privado.
  if (!origen) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origen).host === host;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const esApi = pathname.startsWith("/api/");

  if (esApi && CAMBIA.has(req.method) && !mismoOrigen(req)) {
    return NextResponse.json({ error: "Petición rechazada: viene de otro sitio." }, { status: 403 });
  }

  const publica = esApi
    ? API_PUBLICA.some((r) => r.metodo === req.method && r.ruta.test(pathname))
    : pathname === "/admin/login";
  if (publica) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token && (await verificarToken(token))) return NextResponse.next();

  if (esApi) {
    return NextResponse.json({ error: "Tu sesión expiró. Vuelve a entrar al back office." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}
