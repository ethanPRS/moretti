import { NextRequest, NextResponse } from "next/server";
import { guardarImagen, MAX_BYTES_IMAGEN } from "@/lib/imagenes";
import { ReglaError } from "@/lib/motor/errores";

/** Sube una imagen del back office (campo «archivo»). Detrás del login (proxy.ts). */
export async function POST(req: NextRequest) {
  // Se corta antes de leer el cuerpo: si no, un archivo enorme se cargaría
  // completo en memoria antes de rechazarlo (auditoría 6 oct, H-8).
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES_IMAGEN + 64 * 1024) {
    return NextResponse.json({ error: "La imagen pesa más de 8 MB. Redúcela o expórtala como JPG." }, { status: 413 });
  }
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
