import { describe, expect, it } from "vitest";
import { aCentavos, calcularAdelanto, calcularLiquidacion, type ExhibicionViva } from "./recalculo";

const fecha = (mes: number) => new Date(2026, 9 + mes, 5);
/** Las 12 mensualidades del DEPA 2R con Casa Lista ($147,300): 11 de $8,593 y la última de $8,587. */
const plan = (): ExhibicionViva[] =>
  Array.from({ length: 12 }, (_, i) => ({
    id: `e${i + 1}`,
    numero: i + 1,
    monto: (i === 11 ? 8587 : 8593) * 100,
    fechaProgramada: fecha(i + 1),
  }));
const suma = (xs: { monto: number }[]) => xs.reduce((a, x) => a + x.monto, 0);

describe("R · adelanto: reduce el número de exhibiciones, no el monto", () => {
  it("paga completas las siguientes y el sobrante se abona a la última", () => {
    const r = calcularAdelanto(plan(), aCentavos(20000));
    expect(r.cubiertas.map((e) => e.numero)).toEqual([1, 2]);
    expect(r.ajustada).toEqual({ original: expect.objectContaining({ numero: 12 }), montoNuevo: (8587 - 2814) * 100 });
    expect(r.cobro).toEqual({ numero: 1, monto: 2000000 });
    expect(r.quedan).toHaveLength(10);
    // El monto de las que quedan no cambia, salvo la última.
    expect(r.quedan.slice(0, 9).every((q) => q.monto === 859300 && q.cambio === "igual")).toBe(true);
    expect(r.quedan[9]).toMatchObject({ numero: 12, monto: 577300, cambio: "reducida" });
  });

  it("un adelanto exacto de dos mensualidades no ajusta ninguna", () => {
    const r = calcularAdelanto(plan(), aCentavos(17186));
    expect(r.cubiertas.map((e) => e.numero)).toEqual([1, 2]);
    expect(r.ajustada).toBeNull();
    expect(r.quedan).toHaveLength(10);
  });

  it("un adelanto menor a una exhibición se abona completo a la última", () => {
    const r = calcularAdelanto(plan(), aCentavos(5000));
    expect(r.cubiertas).toEqual([]);
    expect(r.ajustada?.montoNuevo).toBe(358700);
    expect(r.cobro.numero).toBe(12);
    expect(r.quedan).toHaveLength(12);
  });

  it("si el sobrante alcanza para cubrir la última, la cubre y el resto pasa a la penúltima", () => {
    const vivas: ExhibicionViva[] = [
      { id: "a", numero: 1, monto: 100000, fechaProgramada: fecha(1) },
      { id: "b", numero: 2, monto: 100000, fechaProgramada: fecha(2) },
      { id: "c", numero: 3, monto: 30000, fechaProgramada: fecha(3) },
    ];
    const r = calcularAdelanto(vivas, 150000);
    expect(r.cubiertas.map((e) => e.numero)).toEqual([1, 3]);
    expect(r.ajustada).toMatchObject({ original: { numero: 2 }, montoNuevo: 80000 });
    expect(r.quedan).toEqual([{ numero: 2, monto: 80000, fechaProgramada: fecha(2), cambio: "reducida" }]);
  });

  it("R7: cobro + lo que queda = saldo anterior, al centavo, para cualquier monto", () => {
    const vivas = plan();
    const saldo = suma(vivas);
    for (let pesos = 1; pesos * 100 < saldo; pesos += 977) {
      const r = calcularAdelanto(vivas, pesos * 100);
      expect(r.cobro.monto + suma(r.quedan)).toBe(saldo);
      expect(r.quedan.every((q) => q.monto > 0)).toBe(true);
    }
  });

  it("un adelanto que cubre todo el saldo es una liquidación, y el error lo dice", () => {
    expect(() => calcularAdelanto(plan(), aCentavos(103110))).toThrow(
      "El adelanto ($103,110) cubre todo el saldo ($103,110): eso es una liquidación anticipada, no un adelanto."
    );
  });

  it("cero o negativo no procede", () => {
    expect(() => calcularAdelanto(plan(), 0)).toThrow("El adelanto tiene que ser mayor a cero.");
  });
});

describe("R · liquidación anticipada", () => {
  it("cobra el saldo completo, sin descuento, y cancela todas las pendientes", () => {
    const r = calcularLiquidacion(plan());
    expect(r.cobro).toEqual({ numero: 1, monto: 10311000 });
    expect(r.cubiertas).toHaveLength(12);
    expect(r.quedan).toEqual([]);
  });
});

describe("aCentavos", () => {
  it("convierte pesos a centavos sin punto flotante", () => {
    expect(aCentavos("8593")).toBe(859300);
    expect(aCentavos("0.29")).toBe(29);
    expect(aCentavos(1234.5)).toBe(123450);
  });
  it("rechaza lo que no es un monto", () => {
    expect(() => aCentavos("12.345")).toThrow(/hasta dos decimales/);
    expect(() => aCentavos("-5")).toThrow(/no es válido/);
  });
});
