import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cobrarAnticipo, darDeAlta, guardarTarjeta } from "./planes";
import { cobrarVencidas } from "./barrido";
import { crearPasarelaFalsa, rechazo } from "@/lib/pasarela/falsa";
import type { ResultadoCobro, SolicitudCobro } from "@/lib/pasarela/contrato";
import { baseLimpiaConCatalogo, eventosDelPlan, firmarContrato, paquete, unidadLibre } from "@/pruebas/utilidades";

const DIA = 24 * 60 * 60 * 1000;
const despues = (dias: number) => new Date(Date.now() + dias * DIA);

/** Plan Confort con el anticipo cobrado y las mensualidades 1 y 2 ya vencidas. */
async function planConVencidas() {
  const unidad = await unidadLibre("DEPA 2R (tipo 717)");
  const { plan } = await darDeAlta({
    nombre: "Comprador de prueba",
    contacto: "81",
    unidadId: unidad.id,
    paqueteId: (await paquete("confort")).id,
  });
  await firmarContrato(unidad.id);
  await cobrarAnticipo(plan.id, { pasarela: crearPasarelaFalsa() });
  await prisma.exhibicion.updateMany({
    where: { planId: plan.id, numero: { in: [1, 2] } },
    data: { fechaProgramada: new Date(Date.now() - DIA) },
  });
  const [m1, m2, m3] = await prisma.exhibicion.findMany({
    where: { planId: plan.id, numero: { in: [1, 2, 3] } },
    orderBy: { numero: "asc" },
  });
  return { plan, comprador: plan.compradorId, m1, m2, m3 };
}

const exh = (id: string) => prisma.exhibicion.findUniqueOrThrow({ where: { id }, include: { pago: true } });
const planDe = (id: string) => prisma.plan.findUniqueOrThrow({ where: { id } });

/** Rechaza la mensualidad 1 (o las que diga `cuales`) con `codigo` en los intentos indicados; lo demás se cobra. */
function pasarelaQueRechaza(codigo: string, cuales: (s: SolicitudCobro) => boolean) {
  return crearPasarelaFalsa({
    decidir: (s): ResultadoCobro =>
      cuales(s) ? rechazo(codigo) : { estado: "exitoso", referenciaPasarela: `pi_${s.numeroExhibicion}_${s.intento}` },
  });
}

beforeEach(baseLimpiaConCatalogo);

describe("barrido de la cobranza: mensualidades fuera de sesión", () => {
  it("cobra las vencidas fuera de sesión y deja en paz las que no han llegado a su fecha", async () => {
    const { m1, m2, m3 } = await planConVencidas();
    const pasarela = crearPasarelaFalsa();

    const r = await cobrarVencidas({ pasarela });

    expect(r).toMatchObject({ revisadas: 2, cobradas: 2, rechazadas: 0, errores: [] });
    expect(pasarela.cargos.map((c) => c.solicitud.numeroExhibicion)).toEqual([1, 2]);
    expect(pasarela.cargos.every((c) => c.solicitud.compradorPresente === false)).toBe(true);
    expect((await exh(m1.id)).estado).toBe("PAGADA");
    expect((await exh(m2.id)).estado).toBe("PAGADA");
    expect((await exh(m3.id)).estado).toBe("PENDIENTE");
  });

  it("correrlo otra vez no vuelve a cobrar nada", async () => {
    await planConVencidas();
    const pasarela = crearPasarelaFalsa();
    await cobrarVencidas({ pasarela });

    expect((await cobrarVencidas({ pasarela })).revisadas).toBe(0);
    expect(pasarela.llamadas).toBe(2);
  });

  it("dos barridos a la vez: cada mensualidad llega a la pasarela una sola vez", async () => {
    const { plan } = await planConVencidas();
    const pasarela = crearPasarelaFalsa();

    const [a, b] = await Promise.all([cobrarVencidas({ pasarela }), cobrarVencidas({ pasarela })]);

    expect(a.cobradas + b.cobradas).toBe(2);
    expect(pasarela.llamadas).toBe(2);
    expect(await prisma.pago.count({ where: { planId: plan.id } })).toBe(3);
  });

  it("no toca un plan cancelado ni una exhibición con cobro pendiente", async () => {
    const { plan, m1, m2 } = await planConVencidas();
    await prisma.exhibicion.update({ where: { id: m1.id }, data: { cobroPendienteDesde: new Date() } });
    const pasarela = crearPasarelaFalsa();

    expect((await cobrarVencidas({ pasarela })).cobradas).toBe(1);
    expect((await exh(m2.id)).estado).toBe("PAGADA");

    await prisma.plan.update({ where: { id: plan.id }, data: { estado: "CANCELADO" } });
    await prisma.exhibicion.update({ where: { id: m1.id }, data: { cobroPendienteDesde: null } });
    expect((await cobrarVencidas({ pasarela })).revisadas).toBe(0);
  });

  it("un cobro pendiente de más de 48 horas se reporta para revisarlo en Stripe", async () => {
    const { m1 } = await planConVencidas();
    await prisma.exhibicion.update({ where: { id: m1.id }, data: { cobroPendienteDesde: new Date(Date.now() - 3 * DIA) } });

    const r = await cobrarVencidas({ pasarela: crearPasarelaFalsa() });

    expect(r.pendientesSinConfirmar.map((p) => p.exhibicionId)).toEqual([m1.id]);
  });

  it("si no se puede cobrar (sin tarjeta), queda vencida con evento en la bitácora", async () => {
    const { plan, m1 } = await planConVencidas();
    const { ReglaError } = await import("./errores");
    const pasarela = crearPasarelaFalsa();
    pasarela.cobrar = async () => {
      throw new ReglaError("El comprador todavía no registra su tarjeta.");
    };

    const r = await cobrarVencidas({ pasarela });

    expect(r.errores).toHaveLength(2);
    expect(await exh(m1.id)).toMatchObject({ estado: "VENCIDA", bloqueadaHasta: null });
    const vencidas = (await eventosDelPlan(plan.id)).filter((e) => e.tipo === "exhibicion_vencida");
    expect(vencidas).toHaveLength(2);
    expect(vencidas[0].comentario).toMatch(/no registra su tarjeta/);
  });
});

describe("reintentos según el código del rechazo", () => {
  it("insufficient_funds: vencida, reintento a los 3 días con llave nueva, y se cobra", async () => {
    const { plan, m1 } = await planConVencidas();
    const pasarela = pasarelaQueRechaza("insufficient_funds", (s) => s.numeroExhibicion === 1 && s.intento === 1);

    expect((await cobrarVencidas({ pasarela })).rechazadas).toBe(1);
    let m = await exh(m1.id);
    expect(m).toMatchObject({ estado: "VENCIDA", requiereTarjetaNueva: false, ultimoCodigoRechazo: "insufficient_funds" });
    expect(m.proximoIntentoEn!.getTime()).toBeGreaterThan(Date.now() + 3 * DIA - 60_000);

    // Dos días después todavía no.
    await cobrarVencidas({ pasarela, ahora: despues(2) });
    expect(pasarela.llamadas).toBe(2);

    // A los cuatro, sí: intento 2, llave nueva.
    expect((await cobrarVencidas({ pasarela, ahora: despues(4) })).cobradas).toBe(1);
    m = await exh(m1.id);
    expect(m).toMatchObject({ estado: "PAGADA", ultimoCodigoRechazo: null });
    expect(m.pago?.referenciaStripe).toBe("pi_1_2");
    expect(pasarela.cargos.map((c) => c.llave)).toContain(`plan_${plan.id}:exh_1:int_2`);

    const rechazo1 = (await eventosDelPlan(plan.id)).find((e) => e.tipo === "cobro_rechazado");
    expect(rechazo1?.comentario).toMatch(/insufficient_funds, fondos insuficientes.*reintento 1 de 2 por este motivo/);
  });

  it("generic_decline: un solo reintento a los 2 días; si vuelve a fallar, se pide otra tarjeta", async () => {
    const { m1 } = await planConVencidas();
    const pasarela = pasarelaQueRechaza("generic_decline", (s) => s.numeroExhibicion === 1);

    await cobrarVencidas({ pasarela });
    expect((await exh(m1.id)).requiereTarjetaNueva).toBe(false);
    await cobrarVencidas({ pasarela, ahora: despues(3) });

    expect(await exh(m1.id)).toMatchObject({ intentosRechazados: 2, requiereTarjetaNueva: true, proximoIntentoEn: null });
    await cobrarVencidas({ pasarela, ahora: despues(30) });
    expect((await exh(m1.id)).intentosRechazados).toBe(2);
  });

  it("stolen_card: la tarjeta queda inválida para todo el plan hasta que registre otra", async () => {
    const { plan, comprador, m1, m3 } = await planConVencidas();
    const pasarela = pasarelaQueRechaza("stolen_card", (s) => s.numeroExhibicion === 1 && s.intento === 1);

    // La 1 se rechaza; la 2, en el mismo barrido, ya no se toma: la tarjeta quedó inválida.
    const r = await cobrarVencidas({ pasarela });
    expect(r).toMatchObject({ rechazadas: 1, omitidas: 1, cobradas: 0, errores: [] });
    expect(pasarela.llamadas).toBe(1);
    expect((await prisma.comprador.findUniqueOrThrow({ where: { id: comprador } })).tarjetaInvalida).toBe(true);

    // Ni la 3 cuando llegue su fecha.
    await prisma.exhibicion.update({ where: { id: m3.id }, data: { fechaProgramada: new Date(Date.now() - DIA) } });
    expect((await cobrarVencidas({ pasarela, ahora: despues(7) })).revisadas).toBe(0);

    await guardarTarjeta({ compradorId: comprador, referenciaTarjeta: "pm_nueva", descripcion: "visa terminación 4242" });
    expect((await prisma.comprador.findUniqueOrThrow({ where: { id: comprador } })).tarjetaInvalida).toBe(false);
    expect((await cobrarVencidas({ pasarela })).cobradas).toBe(3);
    expect((await exh(m1.id)).estado).toBe("PAGADA");

    const rechazo1 = (await eventosDelPlan(plan.id)).find((e) => e.tipo === "cobro_rechazado");
    expect(rechazo1?.comentario).toMatch(/robada.*marcada como inválida/);
  });

  it("expired_card: pide tarjeta nueva; si el banco la renueva solo, vuelve al barrido", async () => {
    const { comprador, m1 } = await planConVencidas();
    await guardarTarjeta({ compradorId: comprador, referenciaTarjeta: "pm_vieja", descripcion: "visa terminación 4242" });
    const pasarela = pasarelaQueRechaza("expired_card", (s) => s.numeroExhibicion === 1 && s.intento === 1);

    await cobrarVencidas({ pasarela });
    expect(await exh(m1.id)).toMatchObject({ requiereTarjetaNueva: true, ultimoCodigoRechazo: "expired_card" });

    const { actualizarTarjetaDelBanco } = await import("./planes");
    expect(
      await actualizarTarjetaDelBanco({ referenciaTarjeta: "pm_vieja", descripcion: "visa terminación 4242", venceMes: 12, venceAnio: 2030 })
    ).toBe(true);
    expect(await exh(m1.id)).toMatchObject({ requiereTarjetaNueva: false });
    expect(await prisma.comprador.findUniqueOrThrow({ where: { id: comprador } })).toMatchObject({
      tarjetaVenceMes: 12,
      tarjetaVenceAnio: 2030,
    });
    expect((await cobrarVencidas({ pasarela })).cobradas).toBe(1);
  });

  it("el consejo do_not_try_again del banco manda sobre la tabla", async () => {
    const { m1 } = await planConVencidas();
    const pasarela = crearPasarelaFalsa({
      decidir: (s) =>
        s.numeroExhibicion === 1
          ? { ...rechazo("insufficient_funds"), consejo: "do_not_try_again" }
          : { estado: "exitoso", referenciaPasarela: `pi_${s.numeroExhibicion}` },
    });

    await cobrarVencidas({ pasarela });

    expect(await exh(m1.id)).toMatchObject({ requiereTarjetaNueva: true, proximoIntentoEn: null });
  });
});

describe("suspensión del plan", () => {
  it("a la segunda vencida el plan pasa a SUSPENDIDO; el rechazo de la primera no lo cambia", async () => {
    const { plan, m1, m2 } = await planConVencidas();
    const pasarela = pasarelaQueRechaza("insufficient_funds", (s) => s.numeroExhibicion === 1 && s.intento === 1);
    // Sólo la 1 vencida primero.
    await prisma.exhibicion.update({ where: { id: m2.id }, data: { fechaProgramada: despues(10) } });

    await cobrarVencidas({ pasarela });
    expect((await planDe(plan.id)).estado).toBe("ACTIVO");

    // Llega la fecha de la 2 y también la rechazan.
    await prisma.exhibicion.update({ where: { id: m2.id }, data: { fechaProgramada: new Date(Date.now() - DIA) } });
    const todo = pasarelaQueRechaza("insufficient_funds", () => true);
    await cobrarVencidas({ pasarela: todo, ahora: despues(4) });
    expect((await exh(m1.id)).estado).toBe("VENCIDA");
    expect((await planDe(plan.id)).estado).toBe("SUSPENDIDO");
    const suspension = (await eventosDelPlan(plan.id)).find((e) => e.tipo === "plan_suspendido");
    expect(suspension?.comentario).toMatch(/2 exhibiciones vencidas/);
  });

  it("un plan suspendido por vencidas se sigue cobrando y se reactiva al ponerse al corriente", async () => {
    const { plan } = await planConVencidas();
    await cobrarVencidas({ pasarela: pasarelaQueRechaza("insufficient_funds", (s) => s.intento === 1) });
    expect((await planDe(plan.id)).estado).toBe("SUSPENDIDO");

    // Al cobrar la primera queda una sola vencida, menos de las dos que suspenden: se reactiva.
    const r = await cobrarVencidas({ pasarela: crearPasarelaFalsa(), ahora: despues(4) });
    expect(r.cobradas).toBe(2);
    expect((await planDe(plan.id)).estado).toBe("ACTIVO");
    expect((await eventosDelPlan(plan.id)).some((e) => e.tipo === "plan_reactivado")).toBe(true);
  });
});
