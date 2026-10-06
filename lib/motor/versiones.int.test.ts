import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { crearPasarelaFalsa, rechazo } from "@/lib/pasarela/falsa";
import { cobrarAnticipo, cobrarExhibicion, darDeAlta } from "./planes";
import {
  ejecutarAdelanto,
  ejecutarLiquidacion,
  previsualizarAdelanto,
  previsualizarLiquidacion,
  versionesDelPlan,
} from "./versiones";
import { baseLimpiaConCatalogo, firmarContrato, paquete, unidadLibre } from "@/pruebas/utilidades";

/** DEPA 2R con Casa Lista: $147,300 = anticipo $44,190 + 11 × $8,593 + $8,587. */
async function planActivo() {
  const unidad = await unidadLibre("DEPA 2R (tipo 717)");
  const { plan } = await darDeAlta({
    nombre: "Comprador de prueba",
    contacto: "81",
    unidadId: unidad.id,
    paqueteId: (await paquete("casa-lista")).id,
  });
  await firmarContrato(unidad.id);
  const pasarela = crearPasarelaFalsa();
  await cobrarAnticipo(plan.id, { pasarela });
  return { unidad, plan, pasarela };
}

const vigentes = (planId: string) =>
  prisma.exhibicion.findMany({
    where: { planId, estado: { in: ["PENDIENTE", "VENCIDA", "PAGADA"] } },
    orderBy: [{ numero: "asc" }, { tipo: "asc" }],
  });
const total = (xs: { monto: unknown }[]) => xs.reduce((a, x) => a + Number(x.monto), 0);

beforeEach(baseLimpiaConCatalogo);

describe("R · adelanto con versionado", () => {
  it("la vista previa dice cómo queda sin cambiar nada", async () => {
    const { plan } = await planActivo();
    const vista = await previsualizarAdelanto(plan.id, 20000);
    expect(vista).toMatchObject({
      saldoAntes: 103110,
      cobro: 20000,
      saldoDespues: 83110,
      exhibicionesAntes: 12,
      exhibicionesDespues: 10,
    });
    expect(vista.cubiertas.map((c) => c.numero)).toEqual([1, 2]);
    expect(await prisma.versionPlan.count()).toBe(0);
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } })).version).toBe(1);
  });

  it("cobra, crea la versión 2, cuadra al peso y la versión 1 sigue consultable", async () => {
    const { plan, pasarela } = await planActivo();
    const resultado = await ejecutarAdelanto({ planId: plan.id, monto: 20000 }, { pasarela });
    expect(resultado).toMatchObject({ estado: "exitoso", version: 2 });

    const despues = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(despues.version).toBe(2);
    expect(Number(despues.saldo)).toBe(83110);

    const cal = await vigentes(plan.id);
    // R7: anticipo + adelanto (cobrados) + 10 por cobrar = $147,300.
    expect(total(cal)).toBe(147300);
    expect(cal.filter((e) => e.estado === "PENDIENTE")).toHaveLength(10);
    expect(cal.find((e) => e.tipo === "ADELANTO")).toMatchObject({ estado: "PAGADA", version: 2, numero: 1 });
    expect(cal.find((e) => e.numero === 12)).toMatchObject({ version: 2 });
    expect(Number(cal.find((e) => e.numero === 12)!.monto)).toBe(5773);

    const versiones = await versionesDelPlan(plan.id);
    expect(versiones.map((v) => v.version)).toEqual([2, 1]);
    const v1 = versiones[1];
    expect(v1.motivo).toBe("Versión original");
    expect(v1.calendario).toHaveLength(13);
    expect(v1.calendario.filter((f) => f.estado === "PENDIENTE")).toHaveLength(12);
    expect(versiones[0].motivo).toBe(
      "Adelanto de $20,000: paga por adelantado las exhibiciones 1, 2 y abona $2,814 a la 12, que baja a $5,773. Quedan 10 exhibiciones; el monto de las demás no cambia."
    );
  });

  it("R3: lo ya cobrado no se toca; lo sustituido queda como historia, no se borra", async () => {
    const { plan, pasarela } = await planActivo();
    const primera = await prisma.exhibicion.findFirstOrThrow({ where: { planId: plan.id, numero: 1 } });
    await cobrarExhibicion(primera.id, { pasarela });
    const pagadaAntes = await prisma.exhibicion.findUniqueOrThrow({ where: { id: primera.id } });

    await ejecutarAdelanto({ planId: plan.id, monto: 10000 }, { pasarela });

    expect(await prisma.exhibicion.findUniqueOrThrow({ where: { id: primera.id } })).toEqual(pagadaAntes);
    expect(await prisma.exhibicion.count({ where: { planId: plan.id, estado: "REEMPLAZADA" } })).toBe(2); // la 2 y la 12 original
    expect(await prisma.exhibicion.count({ where: { planId: plan.id } })).toBe(13 + 2); // + adelanto + la 12 reducida
  });

  it("una exhibición sustituida ya no se cobra, y el error dice por qué", async () => {
    const { plan, pasarela } = await planActivo();
    await ejecutarAdelanto({ planId: plan.id, monto: 20000 }, { pasarela });
    const sustituida = await prisma.exhibicion.findFirstOrThrow({ where: { planId: plan.id, numero: 2, estado: "REEMPLAZADA" } });
    await expect(cobrarExhibicion(sustituida.id, { pasarela })).rejects.toThrow(/ya no está vigente: un recálculo del plan la sustituyó/);
  });

  it("si el banco rechaza el adelanto, otra versión restituye el calendario anterior", async () => {
    const { plan } = await planActivo();
    const pasarela = crearPasarelaFalsa({ decidir: () => rechazo("insufficient_funds") });
    const antes = (await vigentes(plan.id)).map((e) => [e.numero, Number(e.monto), e.fechaProgramada.getTime()]);

    const resultado = await ejecutarAdelanto({ planId: plan.id, monto: 20000 }, { pasarela });

    expect(resultado).toMatchObject({ estado: "rechazado", version: 3 });
    const despues = await vigentes(plan.id);
    expect(despues.map((e) => [e.numero, Number(e.monto), e.fechaProgramada.getTime()])).toEqual(antes);
    expect(Number((await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } })).saldo)).toBe(103110);
    expect(await prisma.exhibicion.count({ where: { planId: plan.id, tipo: "ADELANTO", estado: "CANCELADA" } })).toBe(1);
    const v3 = (await versionesDelPlan(plan.id))[0];
    expect(v3.motivo).toMatch(/^Se revirtió el adelanto de \$20,000 porque el banco lo rechazó \(insufficient_funds\)/);
  });

  it("no procede antes del anticipo", async () => {
    const unidad = await unidadLibre("DEPA 2R (tipo 717)");
    const { plan } = await darDeAlta({
      nombre: "Sin anticipo",
      contacto: "81",
      unidadId: unidad.id,
      paqueteId: (await paquete("casa-lista")).id,
    });
    await expect(previsualizarAdelanto(plan.id, 1000)).rejects.toThrow(/antes del anticipo/);
  });
});

describe("R · liquidación anticipada", () => {
  it("cobra el saldo sin descuento, cierra el plan y no quedan exhibiciones vivas", async () => {
    const { unidad, plan, pasarela } = await planActivo();
    expect((await previsualizarLiquidacion(plan.id)).cobro).toBe(103110);

    const resultado = await ejecutarLiquidacion({ planId: plan.id }, { pasarela });

    expect(resultado).toMatchObject({ estado: "exitoso", version: 2 });
    const despues = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(despues.estado).toBe("LIQUIDADO");
    expect(Number(despues.saldo)).toBe(0);
    expect(await prisma.exhibicion.count({ where: { planId: plan.id, estado: { in: ["PENDIENTE", "VENCIDA"] } } })).toBe(0);
    expect(await prisma.exhibicion.count({ where: { planId: plan.id, estado: "CANCELADA" } })).toBe(12);
    expect(total(await vigentes(plan.id))).toBe(147300);
    expect((await prisma.unidad.findUniqueOrThrow({ where: { id: unidad.id } })).estadoFinanciero).toBe("LIQUIDADO");
    // Sin descuento: lo cobrado en total es el precio congelado.
    const pagos = await prisma.pago.findMany({ where: { planId: plan.id } });
    expect(total(pagos)).toBe(147300);
  });

  it("un plan liquidado ya no acepta otro recálculo", async () => {
    const { plan, pasarela } = await planActivo();
    await ejecutarLiquidacion({ planId: plan.id }, { pasarela });
    await expect(ejecutarAdelanto({ planId: plan.id, monto: 1000 }, { pasarela })).rejects.toThrow(
      "El plan ya está liquidado: no procede un adelanto."
    );
  });
});
