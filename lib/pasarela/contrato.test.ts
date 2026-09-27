import { describe, it, expect } from "vitest";
import { llaveIdempotencia, type SolicitudCobro } from "./contrato";
import { crearPasarelaFalsa, rechazo } from "./falsa";

const solicitud: SolicitudCobro = {
  planId: "plan1",
  exhibicionId: "exh1",
  numeroExhibicion: 0,
  intento: 1,
  montoCentavos: 5286000,
  comisionCentavos: 792900,
  compradorId: "comp1",
  proyectoId: "proy1",
  compradorPresente: true,
};

describe("S1-01 · llave de idempotencia", () => {
  it("es plan_<id>:exh_<n>:int_<intento>, sin hora ni aleatorios", () => {
    expect(llaveIdempotencia({ planId: "abc", numeroExhibicion: 3, intento: 2 })).toBe(
      "plan_abc:exh_3:int_2"
    );
    // Misma entrada, misma llave, siempre.
    expect(llaveIdempotencia(solicitud)).toBe(llaveIdempotencia({ ...solicitud }));
  });

  it("el intento cambia la llave: un reintento tras un rechazo sí vuelve a intentar", () => {
    expect(llaveIdempotencia({ ...solicitud, intento: 2 })).not.toBe(llaveIdempotencia(solicitud));
  });

  it("no acepta intentos ni exhibiciones inválidos", () => {
    expect(() => llaveIdempotencia({ ...solicitud, intento: 0 })).toThrow();
    expect(() => llaveIdempotencia({ ...solicitud, numeroExhibicion: -1 })).toThrow();
    expect(() => llaveIdempotencia({ ...solicitud, planId: "" })).toThrow();
  });
});

describe("pasarela falsa: se porta como Stripe con las llaves", () => {
  it("tres envíos del mismo intento dejan un solo cargo", async () => {
    const pasarela = crearPasarelaFalsa();
    const respuestas = await Promise.all([1, 2, 3].map(() => pasarela.cobrar(solicitud)));

    expect(pasarela.llamadas).toBe(3);
    expect(pasarela.cargos).toHaveLength(1);
    expect(new Set(respuestas.map((r) => JSON.stringify(r))).size).toBe(1);
  });

  it("un rechazo se recuerda por llave; el siguiente intento sí se vuelve a decidir", async () => {
    let veces = 0;
    const pasarela = crearPasarelaFalsa({
      decidir: (s) =>
        s.intento === 1
          ? (veces++, rechazo("insufficient_funds", true))
          : { estado: "exitoso", referenciaPasarela: "pi_ok" },
    });

    expect((await pasarela.cobrar(solicitud)).estado).toBe("rechazado");
    expect((await pasarela.cobrar(solicitud)).estado).toBe("rechazado");
    expect(veces).toBe(1);
    expect(pasarela.cargos).toHaveLength(0);

    expect(await pasarela.cobrar({ ...solicitud, intento: 2 })).toEqual({
      estado: "exitoso",
      referenciaPasarela: "pi_ok",
    });
    expect(pasarela.cargos).toHaveLength(1);
  });

  it("la misma llave con otro monto es un error, como en Stripe", async () => {
    const pasarela = crearPasarelaFalsa();
    await pasarela.cobrar(solicitud);
    await expect(pasarela.cobrar({ ...solicitud, montoCentavos: solicitud.montoCentavos + 100 })).rejects.toThrow(/otros montos/);
  });

  it("sólo acepta centavos enteros", async () => {
    const pasarela = crearPasarelaFalsa();
    await expect(pasarela.cobrar({ ...solicitud, montoCentavos: 8593.5 })).rejects.toThrow(/centavos/);
    await expect(
      pasarela.cobrar({ ...solicitud, comisionCentavos: solicitud.montoCentavos + 1 })
    ).rejects.toThrow(/comisión/);
  });
});
