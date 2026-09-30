import { NextResponse } from "next/server";
import { leerImagen } from "@/lib/imagenes";

export async function GET(_req: Request, { params }: { params: Promise<{ nombre: string }> }) {
  const { nombre } = await params;
  const imagen = await leerImagen(nombre);
  if (!imagen) return NextResponse.json({ error: "No se encontró la imagen." }, { status: 404 });
  return new Response(Buffer.from(imagen.contenido), {
    headers: {
      "Content-Type": imagen.tipo,
      "Content-Length": String(imagen.contenido.byteLength),
      // El nombre es único por subida: nunca cambia de contenido.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
