import { describe, expect, it } from "vitest";
import { EstadoFinanciero as EnumPrisma } from "@prisma/client";
import {
  TRANSICIONES_FINANCIERAS,
  caminoFinanciero,
  esManual,
  mensajeNoManual,
  mensajeTransicionInvalida,
  puedeTransitar,
  type EstadoFinanciero,
} from "./estados";

const TODOS = Object.keys(TRANSICIONES_FINANCIERAS) as EstadoFinanciero[];

describe("S1-13 · máquina financiera", () => {
  it("tiene exactamente los estados del esquema", () => {
    expect([...TODOS].sort()).toEqual(Object.values(EnumPrisma).sort());
  });

  it("permite lo que dice el criterio y nada más", () => {
    const permitidas = TODOS.flatMap((d) => TRANSICIONES_FINANCIERAS[d].map((h) => `${d}→${h}`)).sort();
    expect(permitidas).toEqual(
      [
        // La entrada: el anticipo aparta (spec §7).
        "COTIZADO→APARTADO",
        // De APARTADO a AL_CORRIENTE y de ahí a LIQUIDADO.
        "APARTADO→AL_CORRIENTE",
        "AL_CORRIENTE→LIQUIDADO",
        // Entre AL_CORRIENTE y SUSPENDIDO en los dos sentidos.
        "AL_CORRIENTE→SUSPENDIDO",
        "SUSPENDIDO→AL_CORRIENTE",
        // De cualquiera a CANCELADO.
        "COTIZADO→CANCELADO",
        "APARTADO→CANCELADO",
        "AL_CORRIENTE→CANCELADO",
        "SUSPENDIDO→CANCELADO",
        "LIQUIDADO→CANCELADO",
      ].sort()
    );
  });

  it("de cualquiera se puede cancelar, y cancelado es definitivo", () => {
    for (const estado of TODOS.filter((e) => e !== "CANCELADO")) {
      expect(puedeTransitar(estado, "CANCELADO")).toBe(true);
    }
    expect(TRANSICIONES_FINANCIERAS.CANCELADO).toEqual([]);
  });

  it("una transición inválida dice cuál sí procede", () => {
    expect(mensajeTransicionInvalida("LIQUIDADO", "SUSPENDIDO")).toBe(
      "No se puede pasar de Liquidado a Suspendido. Desde Liquidado sólo procede: Cancelado."
    );
    expect(mensajeTransicionInvalida("APARTADO", "SUSPENDIDO")).toBe(
      "No se puede pasar de Apartado a Suspendido. Desde Apartado sólo procede: Al corriente, Cancelado."
    );
    expect(mensajeTransicionInvalida("CANCELADO", "AL_CORRIENTE")).toMatch(/definitivo/);
    expect(mensajeTransicionInvalida("SUSPENDIDO", "SUSPENDIDO")).toBe("La unidad ya está en Suspendido.");
  });

  it("encuentra el camino por transiciones permitidas, paso a paso", () => {
    expect(caminoFinanciero("AL_CORRIENTE", "AL_CORRIENTE")).toEqual([]);
    expect(caminoFinanciero("APARTADO", "AL_CORRIENTE")).toEqual(["AL_CORRIENTE"]);
    // Una unidad suspendida que paga su última mensualidad.
    expect(caminoFinanciero("SUSPENDIDO", "LIQUIDADO")).toEqual(["AL_CORRIENTE", "LIQUIDADO"]);
    expect(caminoFinanciero("COTIZADO", "LIQUIDADO")).toEqual(["APARTADO", "AL_CORRIENTE", "LIQUIDADO"]);
    expect(caminoFinanciero("CANCELADO", "AL_CORRIENTE")).toBeNull();
    expect(caminoFinanciero("LIQUIDADO", "AL_CORRIENTE")).toBeNull();
  });

  it("cada paso de cualquier camino es una transición permitida", () => {
    for (const desde of TODOS) {
      for (const hacia of TODOS) {
        const camino = caminoFinanciero(desde, hacia);
        if (!camino) continue;
        [desde, ...camino].slice(0, -1).forEach((paso, i) => {
          expect(puedeTransitar(paso, camino[i])).toBe(true);
        });
      }
    }
  });

  it("a mano sólo se suspende, se reactiva o se cancela; lo demás lo provoca un cobro", () => {
    const manuales = TODOS.flatMap((d) => TODOS.filter((h) => esManual(d, h)).map((h) => `${d}→${h}`)).sort();
    expect(manuales).toEqual(
      [
        "AL_CORRIENTE→SUSPENDIDO",
        "SUSPENDIDO→AL_CORRIENTE",
        "COTIZADO→CANCELADO",
        "APARTADO→CANCELADO",
        "AL_CORRIENTE→CANCELADO",
        "SUSPENDIDO→CANCELADO",
        "LIQUIDADO→CANCELADO",
      ].sort()
    );
    expect(mensajeNoManual("APARTADO")).toBe(
      "Apartado no se marca a mano: llega al cobrar el anticipo con el contrato firmado."
    );
  });
});
