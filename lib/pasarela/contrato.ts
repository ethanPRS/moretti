/**
 * El contrato entre el motor (Ethan) y la pasarela (Charly).
 *
 * El motor nunca llama a Stripe directamente. Llama a esta interfaz.
 * Mientras Charly construye la versión real (lib/pasarela/stripe.ts),
 * el motor programa contra la pasarela falsa (lib/pasarela/falsa.ts) y no
 * se bloquea esperando.
 *
 * Cuando la versión real esté lista, se cambia un import en un solo
 * lugar (lib/pasarela/index.ts) y el resto del motor no se toca.
 *
 * Versión 2 (S1-01, 27 de septiembre). Qué cambió y por qué:
 * docs/contrato-pasarela.md.
 *
 * Versión 2.1 (5 de octubre, Charly; por ratificar con Ethan): sólo agrega,
 * no cambia nada de la v2 — `accion` en el resultado pendiente y el método
 * `confirmarTarjeta`. Detalle en el mismo documento.
 *
 * Versión 2.2 (7 de octubre, Charly): sólo agrega — `consejo` en el rechazo,
 * el vencimiento en la tarjeta confirmada, y `reembolsar`, `capturar` y
 * `liberar`. Qué hacer con cada rechazo ya no lo dice `reintentar`: lo decide
 * el motor por código (lib/motor/rechazos.ts); `reintentar` queda informativo.
 */

/**
 * Lo que la pasarela contesta a un cobro. Son tres casos, no dos:
 *
 * - exitoso: el cargo quedó hecho. El motor aplica el pago.
 * - pendiente: el cargo existe pero todavía no termina — el banco pidió
 *   autenticación (tarjeta 4000 0025 0000 3155) o está en proceso. El motor
 *   NO marca nada como pagado y NO cuenta un intento nuevo: si lo contara, el
 *   siguiente cobro usaría otra llave y, si el comprador sí se autentica,
 *   habría dos cargos. El pago se aplica cuando llega el webhook.
 * - rechazado: el banco dijo que no. El motor deja la exhibición pendiente,
 *   anota el código en la bitácora y el siguiente intento lleva llave nueva.
 */
export type ResultadoCobro =
  | { estado: "exitoso"; referenciaPasarela: string }
  | {
      estado: "pendiente";
      referenciaPasarela: string;
      motivo: string;
      /**
       * v2.1 · Sólo con el comprador presente: lo que el navegador necesita
       * para que el comprador se autentique con su banco. Sin esto el cobro
       * quedaría pendiente para siempre, porque nadie puede autenticarlo.
       */
      accion?: AccionComprador;
    }
  | {
      estado: "rechazado";
      /** El código que manda el banco: insufficient_funds, generic_decline, … */
      codigoRechazo: string;
      mensaje: string;
      /** Informativo desde v2.2: el motor decide por código (lib/motor/rechazos.ts). */
      reintentar: boolean;
      /**
       * v2.2 · El consejo del banco, si lo dio (en Stripe, `advice_code`:
       * do_not_try_again, try_again_later, confirm_card_data). Si dice que no
       * se reintente, el motor lo respeta aunque el código diga otra cosa.
       */
      consejo?: string;
      referenciaPasarela?: string;
    };

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
  /**
   * En centavos, entero: $8,593.00 → 859300. Así ninguna de las dos mitades
   * convierte con punto flotante (8593.1 × 100 no da 859310 exacto en JS).
   */
  montoCentavos: number;
  /** La comisión del canal sobre este cobro, ya calculada por el motor, en centavos. */
  comisionCentavos: number;
  compradorId: string;
  /** Para que la pasarela encuentre la cuenta conectada de Moretti del proyecto. */
  proyectoId: string;
  /** true = anticipo (comprador presente); false = mensualidad (fuera de sesión). */
  compradorPresente: boolean;
}

/** Para guardar la tarjeta del comprador (S1-06). Ver docs/decisiones.md, D-01 y D-02. */
export interface SolicitudTarjeta {
  compradorId: string;
  proyectoId: string;
}

export interface PreparacionTarjeta {
  /**
   * El secreto que el navegador le pasa a los componentes de Stripe para
   * capturar la tarjeta. El número nunca pasa por nuestro servidor.
   */
  clientSecret: string;
}

/** v2.1 · El navegador ya capturó la tarjeta; el servidor verifica que sí quedó guardada. */
export interface SolicitudConfirmarTarjeta {
  compradorId: string;
  /** Lo que devolvió el navegador al terminar la captura (en Stripe, el id del SetupIntent). */
  referenciaPreparacion: string;
}

export interface TarjetaConfirmada {
  /** Con qué se le cobra después, fuera de sesión (en Stripe, el id del PaymentMethod). */
  referenciaTarjeta: string;
  /** Para la bitácora: «visa terminación 4242». Nunca el número completo. */
  descripcion: string;
  /** v2.2 · Para avisar antes de que venza. */
  venceMes?: number;
  venceAnio?: number;
}

/** v2.2 · Devolver dinero de un cobro ya hecho (R3: es un movimiento nuevo). */
export interface SolicitudReembolso {
  pagoId: string;
  /** El cobro que se reembolsa (en Stripe, el PaymentIntent). */
  referenciaPasarela: string;
  proyectoId: string;
  /** 1, 2, 3… el número de reembolso de este pago. Va en la llave. */
  numero: number;
  montoCentavos: number;
  /**
   * Si se le devuelve al comprador también la comisión del canal
   * (refund_application_fee). Siempre explícito: lo decide el contrato, no
   * hay valor por defecto.
   */
  devolverComision: boolean;
}

export interface ReembolsoHecho {
  /** En Stripe, el id del Refund (re_…). */
  referenciaReembolso: string;
  montoCentavos: number;
}

/** v2.2 · Un cobro autorizado sin capturar (capture_method = manual). */
export interface SolicitudAutorizacion {
  referenciaPasarela: string;
  proyectoId: string;
}

/** v2.1 · Para que el comprador complete una autenticación desde el navegador. */
export interface AccionComprador {
  clientSecret: string;
  /** La cuenta donde vive el cargo; el navegador inicializa Stripe con ella. */
  cuentaConectada: string;
}

export interface Pasarela {
  /**
   * Ejecuta un cobro. Debe ser idempotente: llamarla dos veces con la
   * misma combinación planId + numeroExhibicion + intento nunca debe generar
   * dos cargos. La llave se arma con `llaveIdempotencia`.
   */
  cobrar(solicitud: SolicitudCobro): Promise<ResultadoCobro>;

  /**
   * Prepara la captura de la tarjeta para cobros fuera de sesión. La tarjeta
   * guardada se confirma después por webhook (setup_intent.succeeded).
   */
  prepararTarjeta(solicitud: SolicitudTarjeta): Promise<PreparacionTarjeta>;

  /**
   * v2.1 · Verifica con la pasarela que la captura terminó y que la tarjeta
   * es de ese comprador. Si no, lanza error: el navegador no es fuente de verdad.
   */
  confirmarTarjeta(solicitud: SolicitudConfirmarTarjeta): Promise<TarjetaConfirmada>;

  /** v2.2 · Idempotente con `llaveReembolso`: el mismo número de reembolso nunca devuelve dos veces. */
  reembolsar(solicitud: SolicitudReembolso): Promise<ReembolsoHecho>;

  /** v2.2 · Cobra lo autorizado. Contesta como `cobrar`. */
  capturar(solicitud: SolicitudAutorizacion): Promise<ResultadoCobro>;

  /** v2.2 · Libera lo autorizado sin cobrarlo. */
  liberar(solicitud: SolicitudAutorizacion): Promise<void>;
}

/** v2.2 · `pago_<pagoId>:reembolso_<n>`. Determinista, como la del cobro. */
export function llaveReembolso(solicitud: Pick<SolicitudReembolso, "pagoId" | "numero">): string {
  if (!solicitud.pagoId) throw new Error("La llave del reembolso necesita el pago.");
  if (!Number.isInteger(solicitud.numero) || solicitud.numero < 1) {
    throw new Error(`Número de reembolso inválido para la llave: ${solicitud.numero}`);
  }
  return `pago_${solicitud.pagoId}:reembolso_${solicitud.numero}`;
}

/**
 * La llave de idempotencia de un cobro. Se deriva del plan, la exhibición y
 * el intento; nunca de la hora ni de un aleatorio. La usan las dos pasarelas,
 * para que la falsa se comporte igual que Stripe en las pruebas del motor.
 */
export function llaveIdempotencia(
  solicitud: Pick<SolicitudCobro, "planId" | "numeroExhibicion" | "intento">
): string {
  const { planId, numeroExhibicion, intento } = solicitud;
  if (!planId) throw new Error("La llave de idempotencia necesita el plan.");
  if (!Number.isInteger(numeroExhibicion) || numeroExhibicion < 0) {
    throw new Error(`Número de exhibición inválido para la llave: ${numeroExhibicion}`);
  }
  if (!Number.isInteger(intento) || intento < 1) {
    throw new Error(`Número de intento inválido para la llave: ${intento}`);
  }
  return `plan_${planId}:exh_${numeroExhibicion}:int_${intento}`;
}
