import { describe, expect, it } from "vitest";
import {
  cobrosAfectados,
  diasParaVencerTarjeta,
  etapaTarjeta,
  fechaVencimiento,
  textoTarjetaPorVencer,
  ultimoDiaDeLaTarjeta,
} from "./vencimiento-tarjeta";

/** Las 2 de la tarde de Monterrey (UTC−6) de ese día. */
const dia = (fecha: string) => new Date(`${fecha}T14:00:00-06:00`);

describe("E4 · tarjeta por vencer", () => {
  it("la tarjeta vale hasta el último día de su mes (febrero bisiesto incluido)", () => {
    expect(ultimoDiaDeLaTarjeta(10, 2026)).toEqual({ anio: 2026, mes: 10, dia: 31 });
    expect(ultimoDiaDeLaTarjeta(2, 2028)).toEqual({ anio: 2028, mes: 2, dia: 29 });
    expect(ultimoDiaDeLaTarjeta(12, 2026)).toEqual({ anio: 2026, mes: 12, dia: 31 });
    expect(fechaVencimiento(4, 2027)).toBe("30/04/2027");
  });

  it("cuenta los días en México, no en UTC", () => {
    expect(diasParaVencerTarjeta(10, 2026, dia("2026-10-01"))).toBe(30);
    expect(diasParaVencerTarjeta(10, 2026, dia("2026-10-31"))).toBe(0);
    expect(diasParaVencerTarjeta(10, 2026, dia("2026-11-01"))).toBe(-1);
    // 31 oct a las 23:30 en Monterrey ya es 1 nov en UTC: todavía vence hoy.
    expect(diasParaVencerTarjeta(10, 2026, new Date("2026-11-01T05:30:00Z"))).toBe(0);
  });

  it("avisa a 1 mes, 2 semanas, 1 semana y 3 días; antes de un mes, nada", () => {
    const etapa = (f: string) => etapaTarjeta(10, 2026, dia(f));
    expect(etapa("2026-09-30")).toBeNull(); // 31 días
    expect(etapa("2026-10-01")).toBe(30);
    expect(etapa("2026-10-16")).toBe(30); // 15 días
    expect(etapa("2026-10-17")).toBe(14);
    expect(etapa("2026-10-23")).toBe(14); // 8 días
    expect(etapa("2026-10-24")).toBe(7);
    expect(etapa("2026-10-27")).toBe(7); // 4 días
    expect(etapa("2026-10-28")).toBe(3);
    expect(etapa("2026-10-31")).toBe(3); // vence hoy
    expect(etapa("2026-11-01")).toBe("vencida");
  });

  it("sólo cuentan los cobros posteriores al vencimiento; si ya venció, todos", () => {
    const exh = ["2026-10-15", "2026-11-15", "2026-12-15"].map((f) => ({ fechaProgramada: dia(f) }));
    expect(cobrosAfectados(exh, 10, 2026, dia("2026-10-10"))).toBe(2);
    expect(cobrosAfectados(exh, 12, 2026, dia("2026-12-10"))).toBe(0);
    expect(cobrosAfectados(exh, 9, 2026, dia("2026-10-10"))).toBe(3);
  });

  it("el texto dice qué tarjeta, cuándo vence y cuántos cobros dependen de ella", () => {
    const texto = (f: string, cobrosDespues = 4) =>
      textoTarjetaPorVencer({ descripcion: "visa terminación 4242", mes: 10, anio: 2026, hoy: dia(f), cobrosDespues });
    expect(texto("2026-10-21")).toBe(
      "La tarjeta visa terminación 4242 vence el 31/10/2026 (faltan 10 días); quedan 4 cobros programados después. Pídele al comprador que registre otra."
    );
    expect(texto("2026-10-30", 1)).toMatch(/\(falta 1 día\); quedan 1 cobro programado después/);
    expect(texto("2026-10-31")).toMatch(/vence hoy \(31\/10\/2026\)/);
    expect(texto("2026-11-02")).toMatch(/venció el 31\/10\/2026/);
  });
});
