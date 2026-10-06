/**
 * Comprobante fiscal pendiente (actividad S, regla R8): todo cobro nace sin
 * comprobante y hay que cerrarlo. La fecha límite es el día 5 del mes
 * siguiente al del cobro, recorrida al siguiente día hábil si cae en fin de
 * semana o feriado.
 *
 * Pura. Las fechas son días de calendario de México (America/Mexico_City):
 * un cobro del 31 de octubre a las 11 de la noche es de octubre aunque en UTC
 * ya sea 1 de noviembre. Se guardan como mediodía UTC de ese día para que
 * ningún huso las recorra al mostrarlas.
 *
 * Fuera de este sprint: leer el XML y consultar al SAT.
 */

const ZONA = "America/Mexico_City";

/** Días de anticipación con que un pendiente se marca «por vencer» (docs/parametros.md). */
export const DIAS_ALERTA_FISCAL = 3;

export type Dia = { anio: number; mes: number; dia: number }; // mes 1–12

/** El día de calendario en México de un instante. */
export function diaEnMexico(instante: Date): Dia {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instante);
  const valor = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  return { anio: valor("year"), mes: valor("month"), dia: valor("day") };
}

/** Mediodía UTC del día: así se guarda y no se recorre en ningún huso de México. */
export function aFecha(d: Dia): Date {
  return new Date(Date.UTC(d.anio, d.mes - 1, d.dia, 12));
}

function diaSemana(d: Dia): number {
  return aFecha(d).getUTCDay(); // 0 domingo … 6 sábado
}

/** El n-ésimo lunes de un mes (n = 1, 2, 3…). */
function enesimoLunes(anio: number, mes: number, n: number): number {
  const primero = diaSemana({ anio, mes, dia: 1 });
  const primerLunes = 1 + ((8 - primero) % 7);
  return primerLunes + 7 * (n - 1);
}

/**
 * Descanso obligatorio, Ley Federal del Trabajo art. 74. Los feriados que el
 * SAT añada en su calendario (Jueves y Viernes Santo, por ejemplo) se
 * agregan en `extra` (docs/parametros.md).
 */
export function esFeriado(d: Dia, extra: readonly string[] = []): boolean {
  const { anio, mes, dia } = d;
  const clave = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  if (extra.includes(clave)) return true;
  if (mes === 1 && dia === 1) return true;
  if (mes === 2 && dia === enesimoLunes(anio, 2, 1)) return true; // Constitución
  if (mes === 3 && dia === enesimoLunes(anio, 3, 3)) return true; // Natalicio de Benito Juárez
  if (mes === 5 && dia === 1) return true;
  if (mes === 9 && dia === 16) return true;
  if (mes === 10 && dia === 1 && (anio - 2024) % 6 === 0) return true; // Transmisión del Ejecutivo
  if (mes === 11 && dia === enesimoLunes(anio, 11, 3)) return true; // Revolución
  if (mes === 12 && dia === 25) return true;
  return false;
}

export function esHabil(d: Dia, extra: readonly string[] = []): boolean {
  const semana = diaSemana(d);
  return semana !== 0 && semana !== 6 && !esFeriado(d, extra);
}

function siguienteDia(d: Dia): Dia {
  const f = aFecha(d);
  f.setUTCDate(f.getUTCDate() + 1);
  return { anio: f.getUTCFullYear(), mes: f.getUTCMonth() + 1, dia: f.getUTCDate() };
}

/** Día 5 del mes siguiente al del cobro, recorrido al siguiente hábil. */
export function fechaLimiteComprobante(fechaCobro: Date, extra: readonly string[] = []): Date {
  const cobro = diaEnMexico(fechaCobro);
  let limite: Dia = cobro.mes === 12 ? { anio: cobro.anio + 1, mes: 1, dia: 5 } : { anio: cobro.anio, mes: cobro.mes + 1, dia: 5 };
  while (!esHabil(limite, extra)) limite = siguienteDia(limite);
  return aFecha(limite);
}

export type Urgencia = "vencido" | "por_vencer" | "a_tiempo";

/** Días naturales de hoy (en México) a la fecha límite. Negativo si ya pasó. */
export function diasParaVencer(fechaLimite: Date, hoy: Date = new Date()): number {
  const h = aFecha(diaEnMexico(hoy)).getTime();
  const l = aFecha(diaEnMexico(fechaLimite)).getTime();
  return Math.round((l - h) / 86_400_000);
}

/** Para distinguir a simple vista: vencido, por vencer (≤ DIAS_ALERTA_FISCAL) o a tiempo. */
export function urgenciaComprobante(fechaLimite: Date, hoy: Date = new Date()): Urgencia {
  const dias = diasParaVencer(fechaLimite, hoy);
  if (dias < 0) return "vencido";
  if (dias <= DIAS_ALERTA_FISCAL) return "por_vencer";
  return "a_tiempo";
}
