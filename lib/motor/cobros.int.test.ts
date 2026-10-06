import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  aplicarCobroConfirmado,
  cobrarAnticipo,
  cobrarExhibicion,
  darDeAlta,
  PasarelaError,
  registrarCobroRechazado,
} from "./planes";
import { crearPasarelaFalsa, rechazo } from "@/lib/pasarela/falsa";
import type { Pasarela, SolicitudCobro } from "@/lib/pasarela/contrato";
import {
  baseLimpiaConCatalogo,
  eventosDelPlan,
  firmarContrato,
  paquete,
  unidadLibre,
} from "@/pruebas/utilidades";

/** Un plan Confort en un DEPA 2R ($176,200: anticipo $52,860, mensualidades $10,278). */
async function planConfort({ conContrato = true } = {}) {
  const unidad = await unidadLibre("DEPA 2R (tipo 717)");
  const { plan } = await darDeAlta({
    nombre: "Comprador de prueba",
    contacto: "81",
    unidadId: unidad.id,
    paqueteId: (await paquete("confort")).id,
  });
  if (conContrato) await firmarContrato(unidad.id);
  const exhibiciones = await prisma.exhibicion.findMany({
    where: { planId: plan.id },
    orderBy: { numero: "asc" },
  });
  return { unidad, plan, exhibiciones };
}

async function estado(planId: string) {
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id: planId },
    include: {
      exhibiciones: { orderBy: { numero: "asc" }, include: { pago: true } },
      comprador: { include: { unidad: true } },
    },
  });
  return {
    plan,
    anticipo: plan.exhibiciones[0],
    unidad: plan.comprador.unidad,
    pagos: await prisma.pago.count({ where: { planId } }),
  };
}

beforeEach(baseLimpiaConCatalogo);

describe("S1-08 · el motor cobra a través de la pasarela", () => {
  it("un anticipo exitoso guarda la referencia de la pasarela en el pago", async () => {
    const { plan } = await planConfort();
    const pasarela = crearPasarelaFalsa();

    const resultado = await cobrarAnticipo(plan.id, { pasarela });

    expect(resultado).toEqual({
      estado: "exitoso",
      referencia: `falso_plan_${plan.id}:exh_0:int_1`,
    });
    const { anticipo, unidad, plan: cobrado } = await estado(plan.id);
    expect(anticipo.estado).toBe("PAGADA");
    expect(anticipo.pago?.referenciaStripe).toBe(`falso_plan_${plan.id}:exh_0:int_1`);
    expect(Number(anticipo.pago?.montoComision)).toBe(7929);
    expect(cobrado.estado).toBe("ACTIVO");
    expect(cobrado.fechaCongelamiento).not.toBeNull();
    expect(Number(cobrado.saldo)).toBe(176200 - 52860);
    expect(unidad.estadoFinanciero).toBe("APARTADO");
  });

  it("le pasa a la pasarela montos en centavos, la comisión del proyecto y el intento 1", async () => {
    const { plan, exhibiciones } = await planConfort();
    const pasarela = crearPasarelaFalsa();

    await cobrarAnticipo(plan.id, { pasarela });
    await cobrarExhibicion(exhibiciones[1].id, { pasarela });

    const [anticipo, mensualidad] = pasarela.cargos.map((c) => c.solicitud);
    expect(anticipo).toMatchObject({
      planId: plan.id,
      numeroExhibicion: 0,
      intento: 1,
      montoCentavos: 5286000,
      comisionCentavos: 792900,
      compradorPresente: true,
    });
    // 15 % de $10,278 = $1,541.70 → 154170 centavos, sin errores de punto flotante.
    expect(mensualidad).toMatchObject({
      numeroExhibicion: 1,
      montoCentavos: 1027800,
      comisionCentavos: 154170,
      compradorPresente: false,
    });
    expect((await estado(plan.id)).unidad.estadoFinanciero).toBe("AL_CORRIENTE");
  });

  it("R1: sin contrato no se cobra y ni siquiera se llama a la pasarela", async () => {
    const { plan } = await planConfort({ conContrato: false });
    const pasarela = crearPasarelaFalsa();

    await expect(cobrarAnticipo(plan.id, { pasarela })).rejects.toThrow(/falta el contrato firmado/);
    expect(pasarela.llamadas).toBe(0);
    expect((await estado(plan.id)).pagos).toBe(0);
  });

  it("un cobro rechazado deja la exhibición pendiente y el código en la bitácora", async () => {
    const { plan } = await planConfort();
    const pasarela = crearPasarelaFalsa({ decidir: () => rechazo("insufficient_funds", true) });

    const resultado = await cobrarAnticipo(plan.id, { pasarela });

    expect(resultado).toMatchObject({ estado: "rechazado", codigo: "insufficient_funds", intento: 1 });
    expect(resultado.estado === "rechazado" && resultado.mensaje).toBe(
      "El banco rechazó el cobro: fondos insuficientes (insufficient_funds). El anticipo sigue pendiente y el rechazo quedó en la bitácora."
    );
    const { anticipo, unidad, plan: sinCobrar, pagos } = await estado(plan.id);
    expect(anticipo.estado).toBe("PENDIENTE");
    expect(anticipo.intentosRechazados).toBe(1);
    expect(pagos).toBe(0);
    expect(sinCobrar.fechaCongelamiento).toBeNull();
    expect(unidad.estadoFinanciero).toBe("COTIZADO");

    const rechazos = (await eventosDelPlan(plan.id)).filter((e) => e.tipo === "cobro_rechazado");
    expect(rechazos).toHaveLength(1);
    expect(rechazos[0].comentario).toContain("insufficient_funds, fondos insuficientes");
  });

  it("después de un rechazo, el siguiente intento va con llave nueva y sí cobra", async () => {
    const { plan } = await planConfort();
    const pasarela = crearPasarelaFalsa({
      decidir: (s) =>
        s.intento === 1 ? rechazo("generic_decline") : { estado: "exitoso", referenciaPasarela: `pi_${s.intento}` },
    });

    expect((await cobrarAnticipo(plan.id, { pasarela })).estado).toBe("rechazado");
    expect(await cobrarAnticipo(plan.id, { pasarela })).toEqual({ estado: "exitoso", referencia: "pi_2" });
    expect(pasarela.cargos.map((c) => c.llave)).toEqual([`plan_${plan.id}:exh_0:int_2`]);
  });

  it("el mismo cobro enviado tres veces a la vez deja un solo cargo y un solo pago", async () => {
    const { plan } = await planConfort();
    const pasarela = crearPasarelaFalsa();

    const resultados = await Promise.all([1, 2, 3].map(() => cobrarAnticipo(plan.id, { pasarela })));

    expect(resultados.map((r) => r.estado)).toEqual(["exitoso", "exitoso", "exitoso"]);
    expect(pasarela.llamadas).toBe(3);
    expect(pasarela.cargos).toHaveLength(1);
    const { pagos, plan: cobrado } = await estado(plan.id);
    expect(pagos).toBe(1);
    expect(Number(cobrado.saldo)).toBe(176200 - 52860);
    const eventos = await eventosDelPlan(plan.id);
    expect(eventos.filter((e) => e.tipo === "anticipo_cobrado")).toHaveLength(1);
  });

  it("tres clics seguidos: el segundo y el tercero ya no llegan a la pasarela", async () => {
    const { plan } = await planConfort();
    const pasarela = crearPasarelaFalsa();

    await cobrarAnticipo(plan.id, { pasarela });
    await expect(cobrarAnticipo(plan.id, { pasarela })).rejects.toThrow(/ya se cobró/);
    await expect(cobrarAnticipo(plan.id, { pasarela })).rejects.toThrow(/ya se cobró/);
    expect(pasarela.llamadas).toBe(1);
  });

  it("si el banco pide autenticación no se marca nada ni se gasta el intento; el webhook lo aplica una vez", async () => {
    const { plan } = await planConfort();
    const pasarela = crearPasarelaFalsa({
      decidir: () => ({ estado: "pendiente", referenciaPasarela: "pi_3ds", motivo: "el banco pide autenticación" }),
    });

    expect((await cobrarAnticipo(plan.id, { pasarela })).estado).toBe("pendiente");
    // Volver a intentar usa la misma llave: Stripe devolvería el mismo PaymentIntent.
    expect((await cobrarAnticipo(plan.id, { pasarela })).estado).toBe("pendiente");
    let s = await estado(plan.id);
    expect(s.anticipo.estado).toBe("PENDIENTE");
    expect(s.anticipo.intentosRechazados).toBe(0);
    expect(s.pagos).toBe(0);
    expect(s.unidad.estadoFinanciero).toBe("COTIZADO");

    // El comprador se autentica y llega el webhook, dos veces (Stripe reenvía).
    const exhibicionId = s.anticipo.id;
    expect(await aplicarCobroConfirmado({ exhibicionId, referenciaPasarela: "pi_3ds" })).toBe("aplicado");
    expect(await aplicarCobroConfirmado({ exhibicionId, referenciaPasarela: "pi_3ds" })).toBe("ya_aplicado");

    s = await estado(plan.id);
    expect(s.anticipo.estado).toBe("PAGADA");
    expect(s.pagos).toBe(1);
    expect(s.unidad.estadoFinanciero).toBe("APARTADO");
    expect(s.plan.fechaCongelamiento).not.toBeNull();
  });

  it("un webhook de rechazo que llega después de la respuesta no cuenta el intento dos veces", async () => {
    const { plan } = await planConfort();
    const pasarela = crearPasarelaFalsa({ decidir: () => rechazo("insufficient_funds") });

    await cobrarAnticipo(plan.id, { pasarela });
    const { anticipo } = await estado(plan.id);
    const anotado = await registrarCobroRechazado({
      exhibicionId: anticipo.id,
      intento: 1,
      codigo: "insufficient_funds",
    });

    expect(anotado).toBe(false);
    expect((await estado(plan.id)).anticipo.intentosRechazados).toBe(1);
    const rechazos = (await eventosDelPlan(plan.id)).filter((e) => e.tipo === "cobro_rechazado");
    expect(rechazos).toHaveLength(1);
  });

  it("si llega un cargo confirmado distinto para una exhibición ya pagada, se alerta sin tocar el pago", async () => {
    const { plan } = await planConfort();
    await cobrarAnticipo(plan.id, { pasarela: crearPasarelaFalsa() });
    const { anticipo } = await estado(plan.id);

    expect(await aplicarCobroConfirmado({ exhibicionId: anticipo.id, referenciaPasarela: "pi_otro" })).toBe(
      "otro_cargo"
    );
    const { pagos, anticipo: despues } = await estado(plan.id);
    expect(pagos).toBe(1);
    expect(despues.pago?.referenciaStripe).toBe(anticipo.pago?.referenciaStripe);
    const alerta = (await eventosDelPlan(plan.id)).find((e) => e.tipo === "posible_doble_cargo");
    expect(alerta?.comentario).toMatch(/pi_otro.*doble cargo/);
  });

  it("si la pasarela no contesta, no se marca nada y el reintento usa la misma llave", async () => {
    const { plan } = await planConfort();
    const llaves: string[] = [];
    let caida = true;
    const pasarela: Pasarela = {
      async cobrar(s: SolicitudCobro) {
        llaves.push(`exh_${s.numeroExhibicion}:int_${s.intento}`);
        if (caida) throw new Error("ECONNRESET");
        return { estado: "exitoso", referenciaPasarela: "pi_ok" };
      },
      async prepararTarjeta() {
        return { clientSecret: "x" };
      },
      async transferir() {
        return { estado: "fallido", mensaje: "no se usa en esta prueba" };
      },
    };

    await expect(cobrarAnticipo(plan.id, { pasarela })).rejects.toThrow(PasarelaError);
    let s = await estado(plan.id);
    expect(s.anticipo.estado).toBe("PENDIENTE");
    expect(s.anticipo.intentosRechazados).toBe(0);
    expect((await eventosDelPlan(plan.id)).some((e) => e.tipo === "cobro_sin_respuesta")).toBe(true);

    caida = false;
    expect((await cobrarAnticipo(plan.id, { pasarela })).estado).toBe("exitoso");
    expect(llaves).toEqual(["exh_0:int_1", "exh_0:int_1"]);
    s = await estado(plan.id);
    expect(s.anticipo.estado).toBe("PAGADA");
  });

  it("una mensualidad no se cobra antes del anticipo, ni dos veces", async () => {
    const { plan, exhibiciones } = await planConfort();
    const pasarela = crearPasarelaFalsa();

    await expect(cobrarExhibicion(exhibiciones[1].id, { pasarela })).rejects.toThrow(/antes del anticipo/);
    await cobrarAnticipo(plan.id, { pasarela });
    await cobrarExhibicion(exhibiciones[1].id, { pasarela });
    await expect(cobrarExhibicion(exhibiciones[1].id, { pasarela })).rejects.toThrow(/ya está pagada/);
    expect(pasarela.cargos).toHaveLength(2);
  });

  it("cobrar las 13 exhibiciones liquida el plan y el saldo queda en cero", async () => {
    const { plan, exhibiciones } = await planConfort();
    const pasarela = crearPasarelaFalsa();
    for (const ex of exhibiciones) {
      expect((await cobrarExhibicion(ex.id, { pasarela })).estado).toBe("exitoso");
    }
    const s = await estado(plan.id);
    expect(s.plan.estado).toBe("LIQUIDADO");
    expect(Number(s.plan.saldo)).toBe(0);
    expect(s.unidad.estadoFinanciero).toBe("LIQUIDADO");
    const cobrado = await prisma.pago.aggregate({ where: { planId: plan.id }, _sum: { monto: true } });
    expect(Number(cobrado._sum.monto)).toBe(176200);
  });
});
