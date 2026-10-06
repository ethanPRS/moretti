import { describe, expect, it } from "vitest";
import { esFeriado, fechaLimiteComprobante, urgenciaComprobante } from "./fiscal";

/** «2026-11-05» del límite (guardado a mediodía UTC). */
const dia = (f: Date) => f.toISOString().slice(0, 10);
/** Un cobro a las 2 de la tarde de Monterrey (UTC−6). */
const cobro = (fecha: string) => new Date(`${fecha}T14:00:00-06:00`);

describe("S · fecha límite del comprobante: día 5 del mes siguiente, recorrido a hábil", () => {
  it("un día 5 hábil se queda", () => {
    expect(dia(fechaLimiteComprobante(cobro("2026-10-15")))).toBe("2026-11-05"); // jueves
  });

  it("un día 5 en sábado se recorre al lunes", () => {
    expect(dia(fechaLimiteComprobante(cobro("2026-11-20")))).toBe("2026-12-07");
  });

  it("si el lunes al que se recorre es feriado, sigue al martes (5 feb 2028 es sábado; el 7 es día de la Constitución)", () => {
    expect(dia(fechaLimiteComprobante(cobro("2028-01-10")))).toBe("2028-02-08");
  });

  it("un día 5 que es feriado se recorre (5 feb 2029 es el primer lunes de febrero)", () => {
    expect(dia(fechaLimiteComprobante(cobro("2029-01-31")))).toBe("2029-02-06");
  });

  it("un cobro de diciembre vence el 5 de enero del año siguiente", () => {
    expect(dia(fechaLimiteComprobante(cobro("2026-12-28")))).toBe("2027-01-05");
  });

  it("cuenta el mes del cobro en México, no en UTC: 31 oct a las 23:30 es de octubre", () => {
    const tarde = new Date("2026-11-01T05:30:00Z"); // 31 oct, 23:30 en Monterrey
    expect(dia(fechaLimiteComprobante(tarde))).toBe("2026-11-05");
  });

  it("acepta feriados extra del SAT", () => {
    expect(dia(fechaLimiteComprobante(cobro("2026-10-15"), ["2026-11-05"]))).toBe("2026-11-06");
  });

  it("los feriados de ley: fijos y los de lunes", () => {
    expect(esFeriado({ anio: 2026, mes: 9, dia: 16 })).toBe(true);
    expect(esFeriado({ anio: 2027, mes: 2, dia: 1 })).toBe(true); // primer lunes de febrero
    expect(esFeriado({ anio: 2027, mes: 3, dia: 15 })).toBe(true); // tercer lunes de marzo
    expect(esFeriado({ anio: 2026, mes: 11, dia: 16 })).toBe(true); // tercer lunes de noviembre
    expect(esFeriado({ anio: 2030, mes: 10, dia: 1 })).toBe(true); // transmisión del Ejecutivo
    expect(esFeriado({ anio: 2026, mes: 10, dia: 1 })).toBe(false);
  });
});

describe("S · urgencia, para distinguir a simple vista", () => {
  const limite = new Date("2026-11-05T12:00:00Z");
  it("vencido, por vencer (3 días o menos) y a tiempo", () => {
    expect(urgenciaComprobante(limite, cobro("2026-11-06"))).toBe("vencido");
    expect(urgenciaComprobante(limite, cobro("2026-11-05"))).toBe("por_vencer");
    expect(urgenciaComprobante(limite, cobro("2026-11-02"))).toBe("por_vencer");
    expect(urgenciaComprobante(limite, cobro("2026-11-01"))).toBe("a_tiempo");
  });
});
