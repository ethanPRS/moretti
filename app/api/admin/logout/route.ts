/**
 * POST /api/admin/logout
 *
 * Borra la cookie de sesión y redirige a /admin/login.
 */

import { NextResponse } from "next/server";
import { cookieOpciones } from "@/lib/sesion";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...cookieOpciones(true), value: "" });
  return res;
}
