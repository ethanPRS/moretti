/**
 * El contrato entre el motor (Ethan) y la pasarela (Charly).
 *
 * El motor nunca llama a Stripe directamente. Llama a esta interfaz.
 * Mientras Charly construye la versión real (lib/pasarela/stripe.ts),
 * el motor programa contra `pasarelaFalsa` (lib/pasarela/falsa.ts) y no
 * se bloquea esperando.
 *
 * Cuando la versión real esté lista, se cambia un import en un solo
 * lugar (lib/pasarela/index.ts) y el resto del motor no se toca.
 */

export type ResultadoCobro =
  | { exitoso: true; referenciaPasarela: string }
  | { exitoso: false; codigoRechazo: string; mensaje: string; reintentar: boolean };

export interface SolicitudCobro {
  /** Para derivar la llave de idempotencia: plan_<planId>:exh_<n>:int_<intento> */
  planId: string;
  exhibicionId: string;
  numeroExhibicion: number;
  /**
   * 1 en el primer cobro; sube en cada reintento. Va en la llave porque Stripe
   * guarda la respuesta de una llave —incluido un rechazo— al menos 24 horas:
   * reintentar con la misma llave devolvería el mismo rechazo sin volver a
   * intentar. Dos envíos del mismo intento sí comparten llave: eso es lo que
   * evita el doble cargo.
   */
  intento: number;
  /** En pesos con centavos, ej. 8593.00. La pasarela convierte a centavos internamente. */
  monto: number;
  /** Monto de comisión del canal sobre este cobro, ya calculado por el motor. */
  montoComision: number;
  compradorId: string;
  /** true = anticipo (comprador presente); false = mensualidad (fuera de sesión). */
  compradorPresente: boolean;
}

export interface Pasarela {
  /**
   * Ejecuta un cobro. Debe ser idempotente: llamarla dos veces con la
   * misma combinación planId + numeroExhibicion + intento nunca debe generar
   * dos cargos.
   */
  cobrar(solicitud: SolicitudCobro): Promise<ResultadoCobro>;
}
