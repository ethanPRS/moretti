/**
 * Cómo queda el plan después de un adelanto o una liquidación (actividad R).
 *
 * Pura y en centavos enteros: la usa el motor para aplicar y la pantalla de
 * acciones para la vista previa, así que las dos ven exactamente lo mismo.
 *
 * Adelanto (spec R4): reduce el NÚMERO de exhibiciones, no el monto. Paga la
 * siguiente completa y, si sobra, la que sigue. Un sobrante menor a una
 * exhibición se abona a la última (y si la última es más chica que el
 * sobrante, se cubre y el resto pasa a la penúltima).
 *
 * Liquidación: el saldo completo en un cobro, sin descuento. Cancela todas las
 * pendientes.
 *
 * R3: las exhibiciones cobradas no entran aquí; sólo se recalculan las vivas.
 * R7: lo que sale suma exactamente lo que entra.
 */

import { ReglaError, mx } from "./errores";

export type ExhibicionViva = {
  id: string;
  numero: number;
  /** Centavos. */
  monto: number;
  fechaProgramada: Date;
};

export type Recalculo = {
  /** Exhibiciones que el cobro paga por completo: dejan de estar vivas. */
  cubiertas: ExhibicionViva[];
  /** La que recibe el sobrante: se sustituye por una con el monto reducido. */
  ajustada: { original: ExhibicionViva; montoNuevo: number } | null;
  /** El cobro nuevo: toma el número de la primera exhibición que sustituye. */
  cobro: { numero: number; monto: number };
  /** El calendario vivo que queda después del cobro, en orden. */
  quedan: { numero: number; monto: number; fechaProgramada: Date; cambio: "igual" | "reducida" }[];
};

const porNumero = (a: ExhibicionViva, b: ExhibicionViva) => a.numero - b.numero;

/** Pesos a centavos enteros, sin punto flotante de por medio. */
export function aCentavos(pesos: number | string): number {
  const texto = String(pesos).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) throw new ReglaError(`El monto «${texto}» no es válido: usa pesos con hasta dos decimales.`);
  const [enteros, decimales = ""] = texto.split(".");
  return Number(enteros) * 100 + Number(decimales.padEnd(2, "0"));
}

export function calcularAdelanto(vivas: ExhibicionViva[], montoCentavos: number): Recalculo {
  const pendientes = [...vivas].sort(porNumero);
  if (pendientes.length === 0) throw new ReglaError("El plan ya no tiene exhibiciones por cobrar.");
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    throw new ReglaError("El adelanto tiene que ser mayor a cero.");
  }
  const saldo = pendientes.reduce((a, e) => a + e.monto, 0);
  if (montoCentavos >= saldo) {
    throw new ReglaError(
      `El adelanto (${mx(montoCentavos / 100)}) cubre todo el saldo (${mx(saldo / 100)}): eso es una liquidación anticipada, no un adelanto.`
    );
  }

  // De frente: paga completas las siguientes mientras alcance.
  let resto = montoCentavos;
  let inicio = 0;
  while (resto >= pendientes[inicio].monto) {
    resto -= pendientes[inicio].monto;
    inicio++;
  }
  // De atrás: el sobrante se abona a la última; si la cubre, sigue a la penúltima.
  let fin = pendientes.length - 1;
  const cubiertasAtras: ExhibicionViva[] = [];
  while (resto > 0 && resto >= pendientes[fin].monto) {
    resto -= pendientes[fin].monto;
    cubiertasAtras.unshift(pendientes[fin]);
    fin--;
  }
  // Como el adelanto es menor que el saldo, siempre queda al menos una viva.
  const ajustada = resto > 0 ? { original: pendientes[fin], montoNuevo: pendientes[fin].monto - resto } : null;

  const cubiertas = [...pendientes.slice(0, inicio), ...cubiertasAtras];
  const quedan = pendientes.slice(inicio, fin + 1).map((e) =>
    ajustada && e.id === ajustada.original.id
      ? { numero: e.numero, monto: ajustada.montoNuevo, fechaProgramada: e.fechaProgramada, cambio: "reducida" as const }
      : { numero: e.numero, monto: e.monto, fechaProgramada: e.fechaProgramada, cambio: "igual" as const }
  );

  return {
    cubiertas,
    ajustada,
    cobro: { numero: (cubiertas[0] ?? ajustada!.original).numero, monto: montoCentavos },
    quedan,
  };
}

export function calcularLiquidacion(vivas: ExhibicionViva[]): Recalculo {
  const pendientes = [...vivas].sort(porNumero);
  if (pendientes.length === 0) throw new ReglaError("El plan ya no tiene exhibiciones por cobrar.");
  const saldo = pendientes.reduce((a, e) => a + e.monto, 0);
  return {
    cubiertas: pendientes,
    ajustada: null,
    cobro: { numero: pendientes[0].numero, monto: saldo },
    quedan: [],
  };
}

/** «Anticipo», «Mensualidad 4», «Adelanto», «Liquidación anticipada»: para tablas y cintas. */
export function conceptoExhibicion(numero: number, tipo: string): string {
  if (tipo === "ADELANTO") return "Adelanto";
  if (tipo === "LIQUIDACION") return "Liquidación anticipada";
  return numero === 0 ? "Anticipo" : `Mensualidad ${numero}`;
}
