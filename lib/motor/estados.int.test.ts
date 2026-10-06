import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { crearPasarelaFalsa } from "@/lib/pasarela/falsa";
import {
  aplicarCobroConfirmado,
  cambiarEstadoFinanciero,
  cobrarAnticipo,
  cobrarExhibicion,
  darDeAlta,
} from "./planes";
import { baseLimpiaConCatalogo, firmarContrato, paquete, unidadLibre } from "@/pruebas/utilidades";

async function planCobrado() {
  const unidad = await unidadLibre("DEPA 2R (tipo 717)");
  const { plan } = await darDeAlta({
    nombre: "Comprador de prueba",
    contacto: "81",
    unidadId: unidad.id,
    paqueteId: (await paquete("confort")).id,
  });
  await firmarContrato(unidad.id);
  const pasarela = crearPasarelaFalsa();
  await cobrarAnticipo(plan.id, { pasarela });
  const exhibiciones = await prisma.exhibicion.findMany({ where: { planId: plan.id }, orderBy: { numero: "asc" } });
  return { unidad, plan, exhibiciones, pasarela };
}

async function estadoDe(unidadId: string) {
  return (await prisma.unidad.findUniqueOrThrow({ where: { id: unidadId } })).estadoFinanciero;
}

async function transiciones(unidadId: string) {
  const eventos = await prisma.evento.findMany({
    where: { entidadTipo: "unidad", entidadId: unidadId, tipo: "estado_financiero_cambiado" },
    orderBy: { fecha: "asc" },
  });
  return eventos.map((e) => `${e.estadoAnterior}→${e.estadoNuevo}`);
}

beforeEach(baseLimpiaConCatalogo);

describe("S1-13 · máquina financiera en el motor", () => {
  it("el anticipo y las mensualidades mueven el estado por transiciones permitidas, cada una con su evento", async () => {
    const { unidad, exhibiciones, pasarela } = await planCobrado();
    await cobrarExhibicion(exhibiciones[1].id, { pasarela });
    await cobrarExhibicion(exhibiciones[2].id, { pasarela });

    expect(await estadoDe(unidad.id)).toBe("AL_CORRIENTE");
    // AL_CORRIENTE → AL_CORRIENTE no es transición: no deja evento.
    expect(await transiciones(unidad.id)).toEqual(["COTIZADO→APARTADO", "APARTADO→AL_CORRIENTE"]);
  });

  it("suspender y reactivar: entre AL_CORRIENTE y SUSPENDIDO en los dos sentidos", async () => {
    const { unidad, exhibiciones, pasarela } = await planCobrado();
    await cobrarExhibicion(exhibiciones[1].id, { pasarela });

    await cambiarEstadoFinanciero({ unidadId: unidad.id, hacia: "SUSPENDIDO", motivo: "dos exhibiciones vencidas" });
    expect(await estadoDe(unidad.id)).toBe("SUSPENDIDO");
    await cambiarEstadoFinanciero({ unidadId: unidad.id, hacia: "AL_CORRIENTE", motivo: "se puso al día" });
    expect(await estadoDe(unidad.id)).toBe("AL_CORRIENTE");

    const eventos = await prisma.evento.findMany({
      where: { entidadId: unidad.id, tipo: "estado_financiero_cambiado", usuario: "back office" },
      orderBy: { fecha: "asc" },
    });
    expect(eventos.map((e) => e.comentario)).toEqual([
      "Estado financiero: Al corriente → Suspendido. Motivo: dos exhibiciones vencidas.",
      "Estado financiero: Suspendido → Al corriente. Motivo: se puso al día.",
    ]);
  });

  it("una transición inválida se rechaza, dice cuál sí procede y no deja evento", async () => {
    const { unidad } = await planCobrado();
    const antes = await transiciones(unidad.id);

    await expect(cambiarEstadoFinanciero({ unidadId: unidad.id, hacia: "SUSPENDIDO" })).rejects.toThrow(
      "No se puede pasar de Apartado a Suspendido. Desde Apartado sólo procede: Al corriente, Cancelado."
    );
    await expect(cambiarEstadoFinanciero({ unidadId: unidad.id, hacia: "LIQUIDADO" })).rejects.toThrow(
      /sólo procede/
    );
    // Permitida por la máquina, pero la provoca un cobro, no una persona.
    await expect(cambiarEstadoFinanciero({ unidadId: unidad.id, hacia: "AL_CORRIENTE" })).rejects.toThrow(
      "Al corriente no se marca a mano: llega al cobrar la primera mensualidad."
    );
    expect(await estadoDe(unidad.id)).toBe("APARTADO");
    expect(await transiciones(unidad.id)).toEqual(antes);
  });

  it("cancelar exige motivo, cancela el plan y ya no se le cobra", async () => {
    const { unidad, plan, exhibiciones, pasarela } = await planCobrado();

    await expect(cambiarEstadoFinanciero({ unidadId: unidad.id, hacia: "CANCELADO" })).rejects.toThrow(/motivo/);
    await cambiarEstadoFinanciero({ unidadId: unidad.id, hacia: "CANCELADO", motivo: "se arrepintió" });

    expect(await estadoDe(unidad.id)).toBe("CANCELADO");
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } })).estado).toBe("CANCELADO");
    await expect(cobrarExhibicion(exhibiciones[1].id, { pasarela })).rejects.toThrow(/cancelado/);
    // Y cancelado es definitivo.
    await expect(cambiarEstadoFinanciero({ unidadId: unidad.id, hacia: "AL_CORRIENTE" })).rejects.toThrow(/definitivo/);
  });

  it("una unidad suspendida que paga su última mensualidad llega a LIQUIDADO pasando por AL_CORRIENTE", async () => {
    const { unidad, exhibiciones, pasarela } = await planCobrado();
    for (const ex of exhibiciones.slice(1, 12)) await cobrarExhibicion(ex.id, { pasarela });
    await cambiarEstadoFinanciero({ unidadId: unidad.id, hacia: "SUSPENDIDO", motivo: "prueba" });

    await cobrarExhibicion(exhibiciones[12].id, { pasarela });

    expect(await estadoDe(unidad.id)).toBe("LIQUIDADO");
    expect((await transiciones(unidad.id)).slice(-2)).toEqual(["SUSPENDIDO→AL_CORRIENTE", "AL_CORRIENTE→LIQUIDADO"]);
  });

  it("un pago que llega con la unidad cancelada se registra, no mueve el estado y deja una alerta", async () => {
    // El comprador se autenticó (3DS) después de que se canceló: el dinero ya se cobró.
    const unidad = await unidadLibre("DEPA 2R (tipo 717)");
    const { plan } = await darDeAlta({
      nombre: "Comprador de prueba",
      contacto: "81",
      unidadId: unidad.id,
      paqueteId: (await paquete("confort")).id,
    });
    await firmarContrato(unidad.id);
    const pendiente = crearPasarelaFalsa({
      decidir: () => ({ estado: "pendiente", referenciaPasarela: "pi_3ds", motivo: "autenticación" }),
    });
    await cobrarAnticipo(plan.id, { pasarela: pendiente });
    await cambiarEstadoFinanciero({ unidadId: unidad.id, hacia: "CANCELADO", motivo: "se arrepintió" });

    const anticipo = await prisma.exhibicion.findFirstOrThrow({ where: { planId: plan.id, numero: 0 } });
    expect(await aplicarCobroConfirmado({ exhibicionId: anticipo.id, referenciaPasarela: "pi_3ds" })).toBe("aplicado");

    expect(await estadoDe(unidad.id)).toBe("CANCELADO");
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } })).estado).toBe("CANCELADO");
    expect(await prisma.pago.count({ where: { planId: plan.id } })).toBe(1);
    const alerta = await prisma.evento.findFirst({ where: { entidadId: unidad.id, tipo: "estado_financiero_inesperado" } });
    expect(alerta?.comentario).toMatch(/ALERTA.*Cancelado.*reembolso/);
  });
});
