import { NextRequest, NextResponse } from "next/server";
import { subirFotoReferencia } from "@/lib/motor/acabados";
import { ReglaError } from "@/lib/motor/errores";
import { MAX_BYTES_FOTO } from "@/lib/motor/fotos";

/** Lo que puede pesar la petición: la foto más el sobre del formulario. */
const MAX_PETICION = MAX_BYTES_FOTO + 64 * 1024;

/**
 * Sube una foto de referencia a una partida del plan (S1-05). Espera un
 * formulario multipart con el campo «foto». El motor valida tipo, tamaño,
 * máximo de dos y R6; esto sólo corta antes lo que ni siquiera cabe.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_PETICION) {
    return NextResponse.json(
      { error: "La foto pasa de 5 MB, que es el máximo por foto. Redúcela y vuelve a subirla." },
      { status: 413 }
    );
  }

  const formulario = await req.formData().catch(() => null);
  const archivo = formulario?.get("foto");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "No llegó ninguna foto." }, { status: 400 });
  }

  try {
    const foto = await subirFotoReferencia({
      renglonId: id,
      nombre: archivo.name,
      contenido: new Uint8Array(await archivo.arrayBuffer()),
    });
    return NextResponse.json({ id: foto.id, posicion: foto.posicion }, { status: 201 });
  } catch (err) {
    if (err instanceof ReglaError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
