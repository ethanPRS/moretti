import { NextRequest, NextResponse } from "next/server";
import { guardarImagen } from "@/lib/imagenes";
import { ReglaError } from "@/lib/motor/errores";

/** Sube una imagen del back office (campo «archivo»). Falta sesión en /admin (B-3). */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Elige una imagen para subir." }, { status: 400 });
  }
  try {
    const url = await guardarImagen(new Uint8Array(await archivo.arrayBuffer()));
    return NextResponse.json({ url }, { status: 201 });
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
