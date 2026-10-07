import { describe, expect, it } from "vitest";
import { decidirTrasRechazo } from "./reintentos";
import { CODIGOS_CONOCIDOS, explicarRechazo, reglaDeRechazo } from "./rechazos";
import { vencidasQueSuspenden } from "./suspension";

const ahora = new Date("2026-10-07T09:00:00Z");
const dia = 24 * 60 * 60 * 1000;
const decidir = (codigo: string, rechazosConTarjeta = 1, consejo?: string) =>
  decidirTrasRechazo({ codigo, rechazosConTarjeta, ahora, consejo });

describe("reintentos según el código de rechazo (la especificación)", () => {
  it("insufficient_funds: a los 3 días y luego a los 7; al tercero se pide otra tarjeta", () => {
    expect(decidir("insufficient_funds", 1)).toEqual({
      tipo: "reintentar",
      en: new Date(ahora.getTime() + 3 * dia),
      numero: 1,
      de: 2,
    });
    expect(decidir("insufficient_funds", 2)).toMatchObject({ tipo: "reintentar", en: new Date(ahora.getTime() + 7 * dia) });
    expect(decidir("insufficient_funds", 3)).toMatchObject({ tipo: "pedir_tarjeta", motivo: expect.stringMatching(/agotaron/) });
  });

  it("generic_decline: una sola vez, a los 2 días", () => {
    expect(decidir("generic_decline", 1)).toMatchObject({ tipo: "reintentar", en: new Date(ahora.getTime() + 2 * dia) });
    expect(decidir("generic_decline", 2)).toMatchObject({ tipo: "pedir_tarjeta" });
  });

  it.each(["lost_card", "stolen_card", "pickup_card"])("%s: no se reintenta y la tarjeta queda inválida", (codigo) => {
    expect(decidir(codigo)).toMatchObject({ tipo: "tarjeta_invalida" });
  });

  it("expired_card: no se reintenta, se pide tarjeta nueva", () => {
    expect(decidir("expired_card")).toMatchObject({ tipo: "pedir_tarjeta", motivo: expect.stringMatching(/vencida/) });
  });
});

describe("cada código dice a qué se debe", () => {
  it("todos los códigos conocidos tienen explicación propia", () => {
    for (const codigo of CODIGOS_CONOCIDOS) {
      expect(explicarRechazo(codigo)).not.toBe("motivo no reconocido");
    }
  });

  it("los que no están en la especificación también tienen regla propia", () => {
    expect(reglaDeRechazo("processing_error").accion).toEqual({ tipo: "reintentar", esperaDias: [1, 3] });
    expect(reglaDeRechazo("try_again_later").accion).toEqual({ tipo: "reintentar", esperaDias: [1, 3] });
    expect(reglaDeRechazo("issuer_not_available").accion).toEqual({ tipo: "reintentar", esperaDias: [1, 3] });
    expect(reglaDeRechazo("fraudulent").accion).toEqual({ tipo: "tarjeta_invalida" });
  });

  it("authentication_required pide tarjeta con el comprador presente", () => {
    const d = decidir("authentication_required");
    expect(d.tipo === "pedir_tarjeta" && d.motivo).toMatch(/comprador presente/);
  });

  it("un código desconocido no se reintenta solo y pide revisarlo, con el código a la vista", () => {
    const d = decidir("codigo_raro");
    expect(d).toMatchObject({ tipo: "pedir_tarjeta" });
    expect(d.tipo === "pedir_tarjeta" && d.motivo).toMatch(/codigo_raro.*revisarlo en Stripe/);
  });
});

describe("el consejo del banco", () => {
  it("do_not_try_again manda sobre un código que se reintentaría", () => {
    expect(decidir("insufficient_funds", 1, "do_not_try_again")).toMatchObject({
      tipo: "pedir_tarjeta",
      motivo: expect.stringMatching(/do_not_try_again/),
    });
  });

  it("una tarjeta robada queda inválida aunque el banco diga otra cosa", () => {
    expect(decidir("stolen_card", 1, "try_again_later")).toMatchObject({ tipo: "tarjeta_invalida" });
  });
});

describe("cuántas vencidas suspenden", () => {
  it("dos por defecto; se cambia con COBRANZA_VENCIDAS_SUSPENDEN", () => {
    expect(vencidasQueSuspenden({})).toBe(2);
    expect(vencidasQueSuspenden({ COBRANZA_VENCIDAS_SUSPENDEN: "3" })).toBe(3);
    expect(() => vencidasQueSuspenden({ COBRANZA_VENCIDAS_SUSPENDEN: "cero" })).toThrow(/COBRANZA_VENCIDAS_SUSPENDEN/);
  });
});
