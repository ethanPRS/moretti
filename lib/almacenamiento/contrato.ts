/**
 * Dónde se guardan los archivos que sube la gente (por ahora, las fotos de
 * referencia de S1-05). El motor sólo conoce esta interfaz: cambiar de disco
 * local a S3, Vercel Blob o Supabase es escribir otra implementación y
 * cambiar un import en lib/almacenamiento/index.ts (D-12).
 */
export interface Almacenamiento {
  /** Guarda el contenido bajo `clave`. Si ya existía, lo reemplaza. */
  guardar(clave: string, contenido: Uint8Array): Promise<void>;
  /** El contenido guardado bajo `clave`, o null si no existe. */
  leer(clave: string): Promise<Uint8Array | null>;
  /** Borra `clave`. No falla si ya no existía. */
  borrar(clave: string): Promise<void>;
}

/**
 * Las claves las arma el motor, nunca el navegador: carpetas y nombres en
 * minúsculas, números, guiones y un punto de extensión. Así ninguna
 * implementación tiene que preocuparse por «../» ni por nombres raros.
 */
export function validarClave(clave: string): string {
  if (!/^[a-z0-9_-]+(\/[a-z0-9_-]+)*\.[a-z0-9]+$/.test(clave)) {
    throw new Error(`Clave de almacenamiento inválida: «${clave}»`);
  }
  return clave;
}
