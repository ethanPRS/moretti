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
  | { estado: "pendiente"; referenciaPasarela: string; motivo: string }
  | {
      estado: "rechazado";
      /** El código que manda el banco: insufficient_funds, generic_decline, … */
      codigoRechazo: string;
      mensaje: string;
      /** Según la tabla de la spec §4. El motor decide cuándo; la pasarela sólo informa. */
      reintentar: boolean;
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

/**
 * Una transferencia de la plataforma a la cuenta de Moretti (D-34): la
 * plataforma retiene lo cobrado hasta que Ana Cris autoriza pagarle.
 * El monto ya viene neto (cobrado − comisión), en centavos.
 */
export interface SolicitudTransferencia {
  transferenciaId: string;
  proyectoId: string;
  montoCentavos: number;
  /** Las referencias de los cargos que cubre (para `source_transaction` o `transfer_group`). */
  referenciasCargos: string[];
}

export type ResultadoTransferencia =
  | { estado: "exitoso"; referenciaPasarela: string }
  | { estado: "fallido"; mensaje: string };

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
   * Transfiere a la cuenta conectada del proyecto (D-34). Idempotente por
   * `transferenciaId`: la llave es `transferencia_${transferenciaId}`.
   */
  transferir(solicitud: SolicitudTransferencia): Promise<ResultadoTransferencia>;
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
