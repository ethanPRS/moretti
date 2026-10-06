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
  if (tipo === "UPGRADE") return "Diferencia de upgrade";
  return numero === 0 ? "Anticipo" : `Mensualidad ${numero}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Upgrade de paquete (actividad T)
// ─────────────────────────────────────────────────────────────────────────

export type Upgrade = {
  /** Lo que se cobra hoy: el % de anticipo del proyecto sobre la diferencia, al peso. */
  cobroHoy: number;
  /** Lo que queda de la diferencia y se reparte entre las exhibiciones vivas. */
  aRepartir: number;
  /** Las vivas con su monto nuevo: mismo número y fecha, el plan no se alarga. */
  quedan: { id: string; numero: number; monto: number; fechaProgramada: Date }[];
};

/**
 * Spec T: diferencia = paquete nuevo − paquete viejo (los dos a su precio de
 * hoy; el precio congelado original se conserva y sólo se le suma la
 * diferencia). Se cobra hoy el % de anticipo de la diferencia; el resto, más
 * lo que ya se debía, se reparte parejo entre las exhibiciones que quedan.
 * Mensualidades al peso; la última absorbe el redondeo (R7). En centavos.
 */
export function calcularUpgrade(vivas: ExhibicionViva[], diferenciaCentavos: number, anticipoBP: number): Upgrade {
  const pendientes = [...vivas].sort(porNumero);
  if (pendientes.length === 0) {
    throw new ReglaError("El plan ya no tiene exhibiciones por cobrar: no hay dónde repartir el upgrade.");
  }
  if (!Number.isInteger(diferenciaCentavos) || diferenciaCentavos <= 0) {
    throw new ReglaError("El paquete nuevo tiene que costar más que el actual: eso es un upgrade.");
  }
  const cobroHoy = Math.round((diferenciaCentavos * anticipoBP) / 10000 / 100) * 100;
  const aRepartir = diferenciaCentavos - cobroHoy;
  const saldoNuevo = pendientes.reduce((a, e) => a + e.monto, 0) + aRepartir;
  const n = pendientes.length;
  const mensualidad = Math.round(saldoNuevo / n / 100) * 100;
  const ultima = saldoNuevo - mensualidad * (n - 1);
  if (ultima <= 0) throw new Error("Upgrade: la última exhibición quedaría en cero o negativa.");
  return {
    cobroHoy,
    aRepartir,
    quedan: pendientes.map((e, i) => ({
      id: e.id,
      numero: e.numero,
      fechaProgramada: e.fechaProgramada,
      monto: i === n - 1 ? ultima : mensualidad,
    })),
  };
}

export type RenglonNuevo = { clave: string; cantidad: number; precioLista: number; importe: number };

/**
 * Los renglones que el upgrade agrega: lo que trae el paquete nuevo y no el
 * viejo. Los renglones que ya estaban no se tocan (R2: congelados). La
 * diferencia se reparte entre los nuevos en proporción a su precio de lista;
 * el último absorbe el redondeo, así la lista suma el total nuevo (R7).
 * En pesos enteros, como los precios de lista.
 */
export function renglonesDelUpgrade(
  contenidoViejo: Record<string, number>,
  contenidoNuevo: Record<string, number>,
  listaPorClave: Record<string, number | null>,
  diferencia: number
): RenglonNuevo[] {
  for (const [clave, cantidad] of Object.entries(contenidoViejo)) {
    if ((contenidoNuevo[clave] ?? 0) !== cantidad) {
      throw new ReglaError(
        "El paquete nuevo no contiene todo lo del actual con las mismas cantidades: eso no es un upgrade. Revísalo con comercial."
      );
    }
  }
  const nuevas = Object.entries(contenidoNuevo).filter(([clave]) => !(clave in contenidoViejo));
  if (nuevas.length === 0) throw new ReglaError("El paquete nuevo no agrega nada al actual.");
  const conLista = nuevas.map(([clave, cantidad]) => {
    const lista = listaPorClave[clave];
    if (lista == null) throw new ReglaError(`La partida «${clave}» no tiene precio de lista en este prototipo.`);
    return { clave, cantidad, precioLista: lista, peso: lista * cantidad };
  });
  const totalLista = conLista.reduce((a, r) => a + r.peso, 0);
  let asignado = 0;
  return conLista.map((r, i) => {
    const importe = i === conLista.length - 1 ? diferencia - asignado : Math.round((diferencia * r.peso) / totalLista);
    asignado += importe;
    return { clave: r.clave, cantidad: r.cantidad, precioLista: r.precioLista, importe };
  });
}
