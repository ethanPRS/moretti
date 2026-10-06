/**
 * Las máquinas operativa y de instalación de una unidad, y las reglas que las
 * cruzan con la financiera (spec §7, actividad Q).
 *
 *   Operativa:   PENDIENTE → LEVANTAMIENTO_HECHO → ACABADOS_ELEGIDOS
 *                → EN_PRODUCCION → PRODUCIDO → EN_ALMACEN
 *   Instalación: NO_PROGRAMADA → PROGRAMADA → INSTALADA → ENTREGADA
 *
 * Las dos sólo avanzan, de un paso en uno: no hay retroceso. Las reglas
 * cruzadas:
 *   - LEVANTAMIENTO_HECHO requiere la unidad apartada (contrato y anticipo).
 *   - ACABADOS_ELEGIDOS requiere LEVANTAMIENTO_HECHO y un acabado en cada
 *     partida que lo lleva.
 *   - EN_PRODUCCION requiere financiero LIQUIDADO y ACABADOS_ELEGIDOS.
 *   - Con el financiero SUSPENDIDO o CANCELADO, ni la operativa ni la
 *     instalación avanzan; tampoco retroceden.
 *   - PROGRAMADA requiere la pieza producida (PRODUCIDO o EN_ALMACEN).
 *   - ENTREGADA requiere INSTALADA y el acta de entrega firmada.
 *   - R6: con el levantamiento hecho se bloquean upgrade, downgrade y cambio
 *     de acabados.
 *
 * Pura: dice qué falta. Aplicarla y dejar el evento es de lib/motor/obra.ts.
 * Un error nunca dice sólo «no permitido»: nombra cada requisito que falta.
 */

import type { EstadoFinanciero } from "./estados";
import { ETIQUETA_FINANCIERO } from "./estados";

export type EstadoOperativo =
  | "PENDIENTE"
  | "LEVANTAMIENTO_HECHO"
  | "ACABADOS_ELEGIDOS"
  | "EN_PRODUCCION"
  | "PRODUCIDO"
  | "EN_ALMACEN";

export type EstadoInstalacion = "NO_PROGRAMADA" | "PROGRAMADA" | "INSTALADA" | "ENTREGADA";

export const ORDEN_OPERATIVO: readonly EstadoOperativo[] = [
  "PENDIENTE",
  "LEVANTAMIENTO_HECHO",
  "ACABADOS_ELEGIDOS",
  "EN_PRODUCCION",
  "PRODUCIDO",
  "EN_ALMACEN",
];

export const ORDEN_INSTALACION: readonly EstadoInstalacion[] = [
  "NO_PROGRAMADA",
  "PROGRAMADA",
  "INSTALADA",
  "ENTREGADA",
];

export const ETIQUETA_OPERATIVO: Record<EstadoOperativo, string> = {
  PENDIENTE: "Pendiente",
  LEVANTAMIENTO_HECHO: "Levantamiento hecho",
  ACABADOS_ELEGIDOS: "Acabados elegidos",
  EN_PRODUCCION: "En producción",
  PRODUCIDO: "Producido",
  EN_ALMACEN: "En almacén",
};

export const ETIQUETA_INSTALACION: Record<EstadoInstalacion, string> = {
  NO_PROGRAMADA: "No programada",
  PROGRAMADA: "Programada",
  INSTALADA: "Instalada",
  ENTREGADA: "Entregada",
};

/** Lo que el motor necesita saber de la unidad para decidir. */
export type ExpedienteUnidad = {
  financiero: EstadoFinanciero;
  operativo: EstadoOperativo;
  instalacion: EstadoInstalacion;
  /** Partidas del plan vivo que tienen opciones de acabado y no tienen uno elegido. */
  partidasSinAcabado: string[];
  actaEntregaFirmada: boolean;
};

export function siguienteOperativo(actual: EstadoOperativo): EstadoOperativo | null {
  return ORDEN_OPERATIVO[ORDEN_OPERATIVO.indexOf(actual) + 1] ?? null;
}

export function siguienteInstalacion(actual: EstadoInstalacion): EstadoInstalacion | null {
  return ORDEN_INSTALACION[ORDEN_INSTALACION.indexOf(actual) + 1] ?? null;
}

const APARTADA: readonly EstadoFinanciero[] = ["APARTADO", "AL_CORRIENTE", "LIQUIDADO"];

/** El candado financiero común a las dos máquinas: suspendida o cancelada no avanza. */
function candadoFinanciero(financiero: EstadoFinanciero): string | null {
  if (financiero === "SUSPENDIDO") {
    return "el estado financiero está Suspendido: no avanza hasta que se ponga al corriente (tampoco retrocede)";
  }
  if (financiero === "CANCELADO") return "la unidad está Cancelada: ya no avanza";
  return null;
}

/**
 * Lo que falta para pasar la operativa a `hacia`. Vacío si procede.
 * Sólo se avanza al paso siguiente; saltarse uno o retroceder se reporta
 * como lo que falta.
 */
export function faltantesOperativo(u: ExpedienteUnidad, hacia: EstadoOperativo): string[] {
  const actual = ORDEN_OPERATIVO.indexOf(u.operativo);
  const destino = ORDEN_OPERATIVO.indexOf(hacia);
  if (destino <= actual) {
    return [
      destino === actual
        ? `la unidad ya está en ${ETIQUETA_OPERATIVO[hacia]}`
        : `la operativa no retrocede: ya está en ${ETIQUETA_OPERATIVO[u.operativo]}`,
    ];
  }

  const faltan: string[] = [];
  const candado = candadoFinanciero(u.financiero);
  if (candado) faltan.push(candado);

  if (destino > actual + 1) {
    faltan.push(`pasar antes por ${ETIQUETA_OPERATIVO[ORDEN_OPERATIVO[actual + 1]]}`);
  }

  if (hacia === "LEVANTAMIENTO_HECHO" && !APARTADA.includes(u.financiero) && !candado) {
    faltan.push(
      `que la unidad esté apartada (contrato firmado y anticipo cobrado); hoy está en ${ETIQUETA_FINANCIERO[u.financiero]}`
    );
  }
  if (hacia === "ACABADOS_ELEGIDOS" && u.partidasSinAcabado.length > 0) {
    faltan.push(`elegir el acabado de ${u.partidasSinAcabado.map((p) => `«${p}»`).join(", ")}`);
  }
  if (hacia === "EN_PRODUCCION" && u.financiero !== "LIQUIDADO" && !candado) {
    faltan.push(`que el plan esté Liquidado; hoy está en ${ETIQUETA_FINANCIERO[u.financiero]}`);
  }
  return faltan;
}

/** Lo que falta para pasar la instalación a `hacia`. Vacío si procede. */
export function faltantesInstalacion(u: ExpedienteUnidad, hacia: EstadoInstalacion): string[] {
  const actual = ORDEN_INSTALACION.indexOf(u.instalacion);
  const destino = ORDEN_INSTALACION.indexOf(hacia);
  if (destino <= actual) {
    return [
      destino === actual
        ? `la unidad ya está en ${ETIQUETA_INSTALACION[hacia]}`
        : `la instalación no retrocede: ya está en ${ETIQUETA_INSTALACION[u.instalacion]}`,
    ];
  }

  const faltan: string[] = [];
  const candado = candadoFinanciero(u.financiero);
  if (candado) faltan.push(candado);

  if (destino > actual + 1) {
    faltan.push(`pasar antes por ${ETIQUETA_INSTALACION[ORDEN_INSTALACION[actual + 1]]}`);
  }
  if (hacia === "PROGRAMADA" && u.operativo !== "PRODUCIDO" && u.operativo !== "EN_ALMACEN") {
    faltan.push(`que la pieza esté producida; la operativa está en ${ETIQUETA_OPERATIVO[u.operativo]}`);
  }
  if (hacia === "ENTREGADA" && !u.actaEntregaFirmada) {
    faltan.push("el acta de entrega firmada en el expediente");
  }
  return faltan;
}

/** «No se puede pasar a X: falta a; falta b.» */
export function mensajeFaltantes(destino: string, faltan: string[]): string {
  return `No se puede pasar a ${destino}. Falta: ${faltan.join("; ")}.`;
}

/**
 * R6: el upgrade, el downgrade y el cambio de acabados se bloquean con el
 * levantamiento hecho. Devuelve el porqué, o null si todavía se puede.
 * `que` completa el mensaje: «el paquete», «el acabado de "Clósets"».
 */
export function bloqueoPorLevantamiento(operativo: EstadoOperativo, que: string): string | null {
  if (operativo === "PENDIENTE") return null;
  return `Ya no se puede cambiar ${que}: el levantamiento en obra ya se hizo (la unidad está en ${ETIQUETA_OPERATIVO[operativo]}) y desde ahí no hay cambios (R6).`;
}
