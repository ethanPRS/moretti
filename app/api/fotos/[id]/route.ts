import { NextResponse } from "next/server";
import { leerFotoReferencia, quitarFotoReferencia } from "@/lib/motor/acabados";
import { ReglaError } from "@/lib/motor/errores";

/**
 * Sirve una foto de referencia. No son archivos públicos: pasan por aquí para
 * que, cuando /admin tenga sesión, esta ruta quede detrás del mismo candado.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const foto = await leerFotoReferencia(id);
  if (!foto) return NextResponse.json({ error: "No se encontró la foto." }, { status: 404 });
  return new Response(Buffer.from(foto.contenido), {
    headers: {
      "Content-Type": foto.tipo,
      "Content-Length": String(foto.contenido.byteLength),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Quita una foto de referencia (S1-05). Hasta el levantamiento (R6). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await quitarFotoReferencia({ fotoId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
