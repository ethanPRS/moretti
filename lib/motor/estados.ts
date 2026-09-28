/**
 * La máquina del estado financiero de una unidad (spec §7, S1-13).
 *
 *   COTIZADO → APARTADO → AL_CORRIENTE → LIQUIDADO
 *                            ↕
 *                        SUSPENDIDO
 *   y de cualquiera → CANCELADO (con motivo), que es definitivo.
 *
 * Pura: dice qué transición procede y por qué no. Aplicarla y dejar el
 * evento es de lib/motor/planes.ts (`cambiarEstadoFinanciero`).
 */

export type EstadoFinanciero =
  | "COTIZADO"
  | "APARTADO"
  | "AL_CORRIENTE"
  | "LIQUIDADO"
  | "SUSPENDIDO"
  | "CANCELADO";

export const ETIQUETA_FINANCIERO: Record<EstadoFinanciero, string> = {
  COTIZADO: "Cotizado",
  APARTADO: "Apartado",
  AL_CORRIENTE: "Al corriente",
  LIQUIDADO: "Liquidado",
  SUSPENDIDO: "Suspendido",
  CANCELADO: "Cancelado",
};

/** Qué procede desde cada estado. Es la tabla del criterio de S1-13. */
export const TRANSICIONES_FINANCIERAS: Record<EstadoFinanciero, readonly EstadoFinanciero[]> = {
  COTIZADO: ["APARTADO", "CANCELADO"],
  APARTADO: ["AL_CORRIENTE", "CANCELADO"],
  AL_CORRIENTE: ["LIQUIDADO", "SUSPENDIDO", "CANCELADO"],
  SUSPENDIDO: ["AL_CORRIENTE", "CANCELADO"],
  LIQUIDADO: ["CANCELADO"],
  CANCELADO: [],
};

export function puedeTransitar(desde: EstadoFinanciero, hacia: EstadoFinanciero): boolean {
  return TRANSICIONES_FINANCIERAS[desde].includes(hacia);
}

/**
 * Las que se hacen a mano desde el back office. Las demás las provoca un
 * cobro, y marcarlas a mano sería saltarse una regla cruzada (spec §7):
 * APARTADO exige contrato firmado y anticipo cobrado; AL_CORRIENTE desde
 * APARTADO llega con la primera mensualidad; LIQUIDADO, con la última.
 */
export function esManual(desde: EstadoFinanciero, hacia: EstadoFinanciero): boolean {
  if (!puedeTransitar(desde, hacia)) return false;
  return (
    hacia === "CANCELADO" ||
    hacia === "SUSPENDIDO" ||
    (desde === "SUSPENDIDO" && hacia === "AL_CORRIENTE")
  );
}

const POR_COBRO: Partial<Record<EstadoFinanciero, string>> = {
  APARTADO: "llega al cobrar el anticipo con el contrato firmado",
  AL_CORRIENTE: "llega al cobrar la primera mensualidad",
  LIQUIDADO: "llega al cobrar la última exhibición",
};

/** Por qué una transición permitida no se hace a mano. */
export function mensajeNoManual(hacia: EstadoFinanciero): string {
  return `${ETIQUETA_FINANCIERO[hacia]} no se marca a mano: ${POR_COBRO[hacia] ?? "lo provoca un cobro"}.`;
}

/** El mensaje cuando una transición no procede: dice cuál sí. */
export function mensajeTransicionInvalida(desde: EstadoFinanciero, hacia: EstadoFinanciero): string {
  const de = ETIQUETA_FINANCIERO[desde];
  if (desde === hacia) return `La unidad ya está en ${de}.`;
  const proceden = TRANSICIONES_FINANCIERAS[desde];
  if (proceden.length === 0) {
    return `No se puede pasar de ${de} a ${ETIQUETA_FINANCIERO[hacia]}: ${de} es definitivo y ya no procede ningún cambio.`;
  }
  return `No se puede pasar de ${de} a ${ETIQUETA_FINANCIERO[hacia]}. Desde ${de} sólo procede: ${proceden
    .map((e) => ETIQUETA_FINANCIERO[e])
    .join(", ")}.`;
}

/**
 * El camino más corto de un estado a otro por transiciones permitidas, sin
 * contar el de salida; null si no hay. Lo usa el motor al aplicar un pago:
 * un pago ya cobrado nunca se rechaza por el estado, así que si una unidad
 * suspendida paga su última mensualidad pasa por AL_CORRIENTE hasta
 * LIQUIDADO, y cada paso deja su evento.
 */
export function caminoFinanciero(
  desde: EstadoFinanciero,
  hacia: EstadoFinanciero
): EstadoFinanciero[] | null {
  if (desde === hacia) return [];
  const previo = new Map<EstadoFinanciero, EstadoFinanciero>();
  const cola: EstadoFinanciero[] = [desde];
  while (cola.length > 0) {
    const actual = cola.shift()!;
    for (const siguiente of TRANSICIONES_FINANCIERAS[actual]) {
      if (siguiente === desde || previo.has(siguiente)) continue;
      previo.set(siguiente, actual);
      if (siguiente === hacia) {
        // De la meta hacia atrás hasta el de salida, que no se incluye.
        const camino: EstadoFinanciero[] = [];
        for (let paso = hacia; paso !== desde; paso = previo.get(paso)!) camino.unshift(paso);
        return camino;
      }
      cola.push(siguiente);
    }
  }
  return null;
}
