/**
 * Qué foto de referencia se acepta (S1-05): JPG o PNG, de hasta 5 MB, dos
 * por partida. El tipo se decide por el contenido del archivo, no por su
 * extensión ni por lo que diga el navegador (D-11).
 */
import { ReglaError } from "./errores";

export const MAX_FOTOS_POR_PARTIDA = 2;
/** 5 MB = 5 × 1024 × 1024 bytes. */
export const MAX_BYTES_FOTO = 5 * 1024 * 1024;

export type TipoFoto = "image/jpeg" | "image/png";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

/** Lee la firma del archivo. Null si no es JPG ni PNG. */
export function tipoDeFoto(contenido: Uint8Array): TipoFoto | null {
  const empieza = (firma: number[]) => firma.every((b, i) => contenido[i] === b);
  if (empieza(PNG)) return "image/png";
  if (empieza(JPEG)) return "image/jpeg";
  return null;
}

export function extensionDe(tipo: TipoFoto): "jpg" | "png" {
  return tipo === "image/png" ? "png" : "jpg";
}

/** Valida una foto y devuelve su tipo real, o truena con un mensaje que dice qué hacer. */
export function validarFoto(foto: { nombre: string; contenido: Uint8Array }): TipoFoto {
  const nombre = foto.nombre || "la foto";
  if (foto.contenido.byteLength === 0) {
    throw new ReglaError(`«${nombre}» está vacío. Vuelve a elegir la foto.`);
  }
  if (foto.contenido.byteLength > MAX_BYTES_FOTO) {
    const mb = (foto.contenido.byteLength / 1024 / 1024).toFixed(1);
    throw new ReglaError(
      `«${nombre}» pesa ${mb} MB y el máximo es 5 MB por foto. Redúcela y vuelve a subirla.`
    );
  }
  const tipo = tipoDeFoto(foto.contenido);
  if (!tipo) {
    throw new ReglaError(
      `«${nombre}» no es una foto JPG ni PNG, que son las únicas que se aceptan. Si es de iPhone (HEIC), expórtala como JPG.`
    );
  }
  return tipo;
}

export function mensajeMaximoFotos(partida: string): string {
  return `«${partida}» ya tiene ${MAX_FOTOS_POR_PARTIDA} fotos de referencia, que es el máximo. Quita una para subir otra.`;
}
