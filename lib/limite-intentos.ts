/**
 * Freno a la fuerza bruta del login: 5 intentos fallidos desde la misma IP
 * bloquean 15 minutos. Vive en memoria del proceso: suficiente para el
 * prototipo en un solo servidor; con varias instancias, moverlo a Redis.
 */
const MAX_FALLAS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;

const registro = new Map<string, { fallas: number; desde: number }>();

/** Milisegundos que le faltan a esa IP para volver a intentar, o 0. */
export function bloqueadoPor(ip: string, ahora = Date.now()): number {
  const r = registro.get(ip);
  if (!r) return 0;
  if (ahora - r.desde > BLOQUEO_MS) {
    registro.delete(ip);
    return 0;
  }
  return r.fallas >= MAX_FALLAS ? BLOQUEO_MS - (ahora - r.desde) : 0;
}

export function anotarFalla(ip: string, ahora = Date.now()) {
  const r = registro.get(ip);
  if (!r || ahora - r.desde > BLOQUEO_MS) registro.set(ip, { fallas: 1, desde: ahora });
  else r.fallas++;
}

export function limpiar(ip: string) {
  registro.delete(ip);
}
