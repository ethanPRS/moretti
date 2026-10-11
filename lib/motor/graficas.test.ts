import { describe, expect, it } from "vitest";
import { agruparPorMes } from "./graficas";

describe("gráficas · cobrado por mes", () => {
  it("da los últimos 6 meses en orden, con los vacíos en cero", () => {
    const meses = agruparPorMes([], new Date("2026-10-11T18:00:00Z"));
    expect(meses.map((m) => m.etiqueta)).toEqual(["may", "jun", "jul", "ago", "sep", "oct"]);
    expect(meses.every((m) => m.cobrado === 0 && m.pagos === 0)).toBe(true);
  });

  it("suma cada pago en su mes de México (no de UTC) e ignora los de fuera del rango", () => {
    const meses = agruparPorMes(
      [
        // 1 oct 03:00 UTC = 30 sep 21:00 en México.
        { fecha: new Date("2026-10-01T03:00:00Z"), monto: 100.1 },
        { fecha: new Date("2026-09-15T18:00:00Z"), monto: 0.2 },
        { fecha: new Date("2026-10-05T18:00:00Z"), monto: 50 },
        { fecha: new Date("2025-01-05T18:00:00Z"), monto: 999 },
      ],
      new Date("2026-10-11T18:00:00Z")
    );
    expect(meses.find((m) => m.etiqueta === "sep")).toMatchObject({ cobrado: 100.3, pagos: 2 });
    expect(meses.find((m) => m.etiqueta === "oct")).toMatchObject({ cobrado: 50, pagos: 1 });
  });
});
