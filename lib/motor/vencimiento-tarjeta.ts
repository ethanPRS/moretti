import { aFecha, diaEnMexico, type Dia } from "./fiscal";

/**
 * Tarjeta por vencer (E4 del Excel 15 · Escenarios). Pura.
 *
 * Una tarjeta vale hasta el último día de su mes de vencimiento. El back
 * office recibe un aviso al entrar a cada etapa: un mes (30 días), dos
 * semanas, una semana y tres días antes. Sólo importa si al plan todavía le
 * quedan cobros después de esa fecha: si no, la tarjeta ya no se va a usar.
 *
 * Por ahora sólo avisa al back office; al comprador, no (no hay correo).
 */

/** Días antes del vencimiento en que se avisa, de la primera etapa a la última. */
export const AVISOS_TARJETA_DIAS = [30, 14, 7, 3] as const;

export type EtapaTarjeta = (typeof AVISOS_TARJETA_DIAS)[number] | "vencida";

const DIA_MS = 24 * 60 * 60 * 1000;

/** El último día en que la tarjeta todavía cobra (mes 1–12). */
export function ultimoDiaDeLaTarjeta(mes: number, anio: number): Dia {
  // Día 0 del mes siguiente = último día de este mes.
  const d = new Date(Date.UTC(anio, mes, 0, 12));
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

/** Días de calendario de México que le quedan; 0 = vence hoy, negativo = ya venció. */
export function diasParaVencerTarjeta(mes: number, anio: number, hoy: Date = new Date()): number {
  return Math.round((aFecha(ultimoDiaDeLaTarjeta(mes, anio)).getTime() - aFecha(diaEnMexico(hoy)).getTime()) / DIA_MS);
}

/**
 * En qué etapa de aviso está la tarjeta hoy, o null si todavía falta más de
 * un mes. La etapa es la más cercana que ya se alcanzó: con 10 días, la de
 * dos semanas (la de una semana todavía no llega).
 */
export function etapaTarjeta(mes: number, anio: number, hoy: Date = new Date()): EtapaTarjeta | null {
  const dias = diasParaVencerTarjeta(mes, anio, hoy);
  if (dias < 0) return "vencida";
  let etapa: EtapaTarjeta | null = null;
  for (const umbral of AVISOS_TARJETA_DIAS) if (dias <= umbral) etapa = umbral;
  return etapa;
}

const NOMBRE_ETAPA: Record<EtapaTarjeta, string> = {
  30: "aviso de 1 mes",
  14: "aviso de 2 semanas",
  7: "aviso de 1 semana",
  3: "aviso de 3 días",
  vencida: "ya venció",
};

export function nombreEtapa(etapa: EtapaTarjeta): string {
  return NOMBRE_ETAPA[etapa];
}

/** «31/10/2026». */
export function fechaVencimiento(mes: number, anio: number): string {
  const d = ultimoDiaDeLaTarjeta(mes, anio);
  return `${String(d.dia).padStart(2, "0")}/${String(d.mes).padStart(2, "0")}/${d.anio}`;
}

/**
 * Cuántas exhibiciones vivas van a cobrarse a esta tarjeta cuando ya no
 * sirva: las programadas después de su último día. Si ya venció, todas.
 */
export function cobrosAfectados(exhibiciones: { fechaProgramada: Date }[], mes: number, anio: number, hoy: Date = new Date()): number {
  if (diasParaVencerTarjeta(mes, anio, hoy) < 0) return exhibiciones.length;
  const ultimo = aFecha(ultimoDiaDeLaTarjeta(mes, anio));
  return exhibiciones.filter((e) => e.fechaProgramada > ultimo).length;
}

/** El texto para el back office: qué tarjeta, cuándo vence y cuántos cobros dependen de ella. */
export function textoTarjetaPorVencer(p: {
  descripcion: string | null;
  mes: number;
  anio: number;
  hoy: Date;
  cobrosDespues: number;
}): string {
  const dias = diasParaVencerTarjeta(p.mes, p.anio, p.hoy);
  const tarjeta = p.descripcion ? `La tarjeta ${p.descripcion}` : "La tarjeta";
  const cuando =
    dias < 0
      ? `venció el ${fechaVencimiento(p.mes, p.anio)}`
      : dias === 0
        ? `vence hoy (${fechaVencimiento(p.mes, p.anio)})`
        : `vence el ${fechaVencimiento(p.mes, p.anio)} (${dias === 1 ? "falta 1 día" : `faltan ${dias} días`})`;
  const cobros = p.cobrosDespues === 1 ? "1 cobro programado después" : `${p.cobrosDespues} cobros programados después`;
  return `${tarjeta} ${cuando}; quedan ${cobros}. Pídele al comprador que registre otra.`;
}
