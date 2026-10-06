import { describe, expect, it } from "vitest";
import {
  bloqueoPorLevantamiento,
  faltantesInstalacion,
  faltantesOperativo,
  mensajeFaltantes,
  siguienteInstalacion,
  siguienteOperativo,
  type ExpedienteUnidad,
} from "./operacion";

const base: ExpedienteUnidad = {
  financiero: "AL_CORRIENTE",
  operativo: "PENDIENTE",
  instalacion: "NO_PROGRAMADA",
  partidasSinAcabado: [],
  actaEntregaFirmada: false,
};
const u = (cambios: Partial<ExpedienteUnidad>): ExpedienteUnidad => ({ ...base, ...cambios });

describe("Q · máquina operativa", () => {
  it("avanza de un paso en uno, en orden", () => {
    expect(siguienteOperativo("PENDIENTE")).toBe("LEVANTAMIENTO_HECHO");
    expect(siguienteOperativo("EN_PRODUCCION")).toBe("PRODUCIDO");
    expect(siguienteOperativo("EN_ALMACEN")).toBeNull();
  });

  it("el levantamiento requiere la unidad apartada, y lo dice", () => {
    expect(faltantesOperativo(u({ financiero: "COTIZADO" }), "LEVANTAMIENTO_HECHO")).toEqual([
      "que la unidad esté apartada (contrato firmado y anticipo cobrado); hoy está en Cotizado",
    ]);
    expect(faltantesOperativo(u({ financiero: "APARTADO" }), "LEVANTAMIENTO_HECHO")).toEqual([]);
  });

  it("ACABADOS_ELEGIDOS requiere LEVANTAMIENTO_HECHO", () => {
    expect(faltantesOperativo(u({}), "ACABADOS_ELEGIDOS")).toEqual(["pasar antes por Levantamiento hecho"]);
  });

  it("ACABADOS_ELEGIDOS nombra cada partida que no tiene acabado", () => {
    const faltan = faltantesOperativo(
      u({ operativo: "LEVANTAMIENTO_HECHO", partidasSinAcabado: ["Clósets de recámaras", "Cocina integral"] }),
      "ACABADOS_ELEGIDOS"
    );
    expect(faltan).toEqual(["elegir el acabado de «Clósets de recámaras», «Cocina integral»"]);
  });

  it("EN_PRODUCCION requiere LIQUIDADO y ACABADOS_ELEGIDOS: con los dos faltando, nombra los dos", () => {
    const faltan = faltantesOperativo(u({ operativo: "LEVANTAMIENTO_HECHO" }), "EN_PRODUCCION");
    expect(faltan).toEqual([
      "pasar antes por Acabados elegidos",
      "que el plan esté Liquidado; hoy está en Al corriente",
    ]);
    expect(mensajeFaltantes("En producción", faltan)).toBe(
      "No se puede pasar a En producción. Falta: pasar antes por Acabados elegidos; que el plan esté Liquidado; hoy está en Al corriente."
    );
  });

  it("EN_PRODUCCION procede con LIQUIDADO y ACABADOS_ELEGIDOS", () => {
    expect(faltantesOperativo(u({ operativo: "ACABADOS_ELEGIDOS", financiero: "LIQUIDADO" }), "EN_PRODUCCION")).toEqual([]);
  });

  it("con el financiero SUSPENDIDO la operativa no avanza", () => {
    expect(faltantesOperativo(u({ financiero: "SUSPENDIDO", operativo: "LEVANTAMIENTO_HECHO" }), "ACABADOS_ELEGIDOS")).toEqual([
      "el estado financiero está Suspendido: no avanza hasta que se ponga al corriente (tampoco retrocede)",
    ]);
  });

  it("con la unidad CANCELADA no avanza", () => {
    expect(faltantesOperativo(u({ financiero: "CANCELADO" }), "LEVANTAMIENTO_HECHO")).toEqual([
      "la unidad está Cancelada: ya no avanza",
    ]);
  });

  it("no retrocede ni repite", () => {
    expect(faltantesOperativo(u({ operativo: "ACABADOS_ELEGIDOS" }), "PENDIENTE")).toEqual([
      "la operativa no retrocede: ya está en Acabados elegidos",
    ]);
    expect(faltantesOperativo(u({ operativo: "ACABADOS_ELEGIDOS" }), "ACABADOS_ELEGIDOS")).toEqual([
      "la unidad ya está en Acabados elegidos",
    ]);
  });
});

describe("Q · máquina de instalación", () => {
  it("avanza de un paso en uno", () => {
    expect(siguienteInstalacion("NO_PROGRAMADA")).toBe("PROGRAMADA");
    expect(siguienteInstalacion("ENTREGADA")).toBeNull();
  });

  it("programar requiere la pieza producida", () => {
    expect(faltantesInstalacion(u({ operativo: "EN_PRODUCCION" }), "PROGRAMADA")).toEqual([
      "que la pieza esté producida; la operativa está en En producción",
    ]);
    expect(faltantesInstalacion(u({ operativo: "PRODUCIDO" }), "PROGRAMADA")).toEqual([]);
    expect(faltantesInstalacion(u({ operativo: "EN_ALMACEN" }), "PROGRAMADA")).toEqual([]);
  });

  it("ENTREGADA requiere el acta firmada en el expediente", () => {
    const instalada = u({ financiero: "LIQUIDADO", operativo: "EN_ALMACEN", instalacion: "INSTALADA" });
    expect(faltantesInstalacion(instalada, "ENTREGADA")).toEqual(["el acta de entrega firmada en el expediente"]);
    expect(faltantesInstalacion({ ...instalada, actaEntregaFirmada: true }, "ENTREGADA")).toEqual([]);
  });

  it("con el financiero SUSPENDIDO la instalación tampoco avanza", () => {
    expect(
      faltantesInstalacion(u({ financiero: "SUSPENDIDO", operativo: "EN_ALMACEN" }), "PROGRAMADA")
    ).toEqual(["el estado financiero está Suspendido: no avanza hasta que se ponga al corriente (tampoco retrocede)"]);
  });
});

describe("Q · R6, cambios bloqueados con el levantamiento hecho", () => {
  it("antes del levantamiento se puede cambiar; después, el error dice por qué", () => {
    expect(bloqueoPorLevantamiento("PENDIENTE", "el paquete")).toBeNull();
    expect(bloqueoPorLevantamiento("LEVANTAMIENTO_HECHO", "el paquete")).toBe(
      "Ya no se puede cambiar el paquete: el levantamiento en obra ya se hizo (la unidad está en Levantamiento hecho) y desde ahí no hay cambios (R6)."
    );
  });
});
