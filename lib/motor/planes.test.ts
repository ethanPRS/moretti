import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { calcularExhibiciones } from "./calculo";
import { calcularExhibicionesEnteras } from "./enteros";
import { CATALOGO, PARTIDAS } from "../../prisma/catalogo";

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

describe("calcularExhibicionesEnteras", () => {
  /**
   * El cotizador del sitio calcula con enteros y el motor con Decimal. Si los
   * dos no dan exactamente lo mismo, el comprador ve un número y se le cobra
   * otro. Esto lo comprueba contra todo lo que se puede cotizar hoy: los 52
   * precios de paquete cerrado más toda canasta posible de «Arma el tuyo».
   */
  it("da lo mismo que el motor en los 52 precios de paquete del catálogo", () => {
    let casos = 0;
    for (const prototipos of Object.values(CATALOGO)) {
      for (const proto of prototipos) {
        for (const precio of proto.precios) {
          const conDecimal = calcularExhibiciones(new Decimal(precio), new Decimal(0.3));
          const conEnteros = calcularExhibicionesEnteras(precio, 3000);

          expect(conEnteros.anticipo).toBe(conDecimal[0].monto.toNumber());
          expect(conEnteros.mensualidad).toBe(conDecimal[1].monto.toNumber());
          expect(conEnteros.ultima).toBe(conDecimal[12].monto.toNumber());
          casos++;
        }
      }
    }
    expect(casos).toBe(52);
  });

  it("da lo mismo en las 13,312 canastas posibles de «Arma el tuyo»", () => {
    const armables = PARTIDAS.filter((p) => p.armable && !p.porEquipo);
    let casos = 0;

    for (const prototipos of Object.values(CATALOGO)) {
      for (const proto of prototipos) {
        // Todas las combinaciones de las 9 partidas marcables, cruzadas con
        // los climas de 0 al doble del que trae el prototipo.
        for (let mascara = 0; mascara < 1 << armables.length; mascara++) {
          for (let climas = 0; climas <= proto.climas * 2; climas += proto.climas || 1) {
            let total = climas * proto.partidas.clima;
            armables.forEach((partida, i) => {
              if (mascara & (1 << i)) total += proto.partidas[partida.clave];
            });
            if (total === 0) continue;

            const conDecimal = calcularExhibiciones(new Decimal(total), new Decimal(0.3));
            const conEnteros = calcularExhibicionesEnteras(total, 3000);

            expect(conEnteros.anticipo).toBe(conDecimal[0].monto.toNumber());
            expect(conEnteros.mensualidad).toBe(conDecimal[1].monto.toNumber());
            expect(conEnteros.ultima).toBe(conDecimal[12].monto.toNumber());
            casos++;
          }
        }
      }
    }
    expect(casos).toBeGreaterThan(13000);
  });
});
