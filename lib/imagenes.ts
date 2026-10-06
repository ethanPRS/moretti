import { randomUUID } from "node:crypto";
import { almacenamiento } from "./almacenamiento";
import { ReglaError } from "./motor/errores";

/**
 * Imágenes del sitio que sube el back office (proyectos y paquetes). Son
 * públicas, a diferencia de las fotos de referencia de los compradores. Se
 * guardan detrás de la misma interfaz de almacenamiento (D-12).
 */
export const MAX_BYTES_IMAGEN = 8 * 1024 * 1024;

const TIPOS = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
type Extension = keyof typeof TIPOS;

/** El tipo se decide por el contenido del archivo, no por lo que diga el navegador. */
function detectar(b: Uint8Array): Extension | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "webp";
  return null;
}

/** Guarda la imagen y devuelve la dirección con la que se muestra. */
export async function guardarImagen(contenido: Uint8Array): Promise<string> {
  if (contenido.byteLength === 0) throw new ReglaError("El archivo está vacío.");
  if (contenido.byteLength > MAX_BYTES_IMAGEN) {
    throw new ReglaError("La imagen pesa más de 8 MB. Redúcela o expórtala como JPG.");
  }
  const ext = detectar(contenido);
  if (!ext) throw new ReglaError("Sólo se aceptan imágenes JPG, PNG o WebP.");
  const nombre = `${randomUUID()}.${ext}`;
  await almacenamiento.guardar(`imagenes/${nombre}`, contenido);
  return `/api/imagenes/${nombre}`;
}

export async function leerImagen(nombre: string) {
  const m = /^([0-9a-f-]{36})\.(jpg|png|webp)$/.exec(nombre);
  if (!m) return null;
  const contenido = await almacenamiento.leer(`imagenes/${nombre}`);
  return contenido ? { contenido, tipo: TIPOS[m[2] as Extension] } : null;
}
