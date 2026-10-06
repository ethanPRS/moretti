/**
 * Frenos contra abuso, en memoria del proceso: suficiente para el prototipo
 * en un solo servidor; con varias instancias, moverlos a Redis.
 *
 * - Login: 5 fallas por IP bloquean 15 minutos, y además un tope global de
 *   50 fallas en 15 minutos, por si alguien rota la IP (auditoría 6 oct, H-4).
 * - Apartar desde el sitio: 5 apartados por IP por hora, para que nadie
 *   ocupe el inventario con datos falsos (H-3).
 */

type Registro = { cuenta: number; desde: number };

export function crearLimite(max: number, ventanaMs: number) {
  const registro = new Map<string, Registro>();
  const vigente = (clave: string, ahora: number) => {
    const r = registro.get(clave);
    if (!r) return null;
    if (ahora - r.desde > ventanaMs) {
      registro.delete(clave);
      return null;
    }
    return r;
  };
  return {
    /** Milisegundos que le faltan para volver a intentar, o 0. */
    bloqueadoPor(clave: string, ahora = Date.now()): number {
      const r = vigente(clave, ahora);
      return r && r.cuenta >= max ? ventanaMs - (ahora - r.desde) : 0;
    },
    anotar(clave: string, ahora = Date.now()) {
      const r = vigente(clave, ahora);
      if (!r) registro.set(clave, { cuenta: 1, desde: ahora });
      else r.cuenta++;
    },
    limpiar(clave: string) {
      registro.delete(clave);
    },
  };
}

const VENTANA_LOGIN = 15 * 60 * 1000;
const loginPorIp = crearLimite(5, VENTANA_LOGIN);
const loginGlobal = crearLimite(50, VENTANA_LOGIN);
const GLOBAL = "*";

/** Milisegundos que le faltan a esa IP para volver a intentar el login, o 0. */
export function bloqueadoPor(ip: string, ahora = Date.now()): number {
  return Math.max(loginPorIp.bloqueadoPor(ip, ahora), loginGlobal.bloqueadoPor(GLOBAL, ahora));
}

export function anotarFalla(ip: string, ahora = Date.now()) {
  loginPorIp.anotar(ip, ahora);
  loginGlobal.anotar(GLOBAL, ahora);
}

export function limpiar(ip: string) {
  loginPorIp.limpiar(ip);
}

export const limiteApartar = crearLimite(5, 60 * 60 * 1000);
