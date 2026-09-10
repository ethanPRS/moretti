import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { calcularExhibiciones } from "./calculo";

const { Decimal } = Prisma;

const suma = (exhibiciones: { monto: Prisma.Decimal }[]) =>
  exhibiciones.reduce((acc, e) => acc.add(e.monto), new Decimal(0));

describe("calcularExhibiciones", () => {
  it("reproduce el ejemplo de la especificación (P1 Casa Lista, $147,300)", () => {
    const exhibiciones = calcularExhibiciones(new Decimal(147300), new Decimal(0.3));

    expect(exhibiciones[0].monto.toNumber()).toBe(44190);
    for (let i = 1; i <= 11; i++) {
      expect(exhibiciones[i].monto.toNumber()).toBe(8593);
    }
    expect(exhibiciones[12].monto.toNumber()).toBe(8587);
  });

  it("R7: la suma cuadra al peso con cualquier precio de la lista real", () => {
    const preciosReales = [
      147300, 176200, 195600, 375800, 145700, 174700, 192400, 372500, 212700,
      251300, 270700, 450800, 169500, 208000, 225700, 405900, 178300, 207200,
      224900, 405100, 98900, 127800, 145500, 325600, 76200, 85800, 101900,
      282000, 91600, 110900, 126900, 307100,
    ];

    for (const precio of preciosReales) {
      const exhibiciones = calcularExhibiciones(new Decimal(precio), new Decimal(0.3));
      expect(exhibiciones).toHaveLength(13);
      expect(suma(exhibiciones).toNumber()).toBe(precio);
    }
  });

  it("absorbe el redondeo en la última exhibición, no lo reparte", () => {
    const exhibiciones = calcularExhibiciones(new Decimal(147300), new Decimal(0.3));
    const mensualidades = exhibiciones.slice(1, 12).map((e) => e.monto.toNumber());

    expect(new Set(mensualidades).size).toBe(1);
    expect(exhibiciones[12].monto.toNumber()).not.toBe(mensualidades[0]);
  });

  it("respeta un porcentaje de anticipo distinto sin romper R7", () => {
    const exhibiciones = calcularExhibiciones(new Decimal(147300), new Decimal(0.5));

    expect(exhibiciones[0].monto.toNumber()).toBe(73650);
    expect(suma(exhibiciones).toNumber()).toBe(147300);
  });
});
