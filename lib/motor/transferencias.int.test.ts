import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { crearPasarelaFalsa } from "@/lib/pasarela/falsa";
import type { Pasarela } from "@/lib/pasarela";
import { cobrarAnticipo, darDeAlta } from "./planes";
import { autorizarTransferencia, retenidoPorProyecto } from "./transferencias";
import { baseLimpiaConCatalogo, firmarContrato, paquete, unidadLibre } from "@/pruebas/utilidades";

async function anticipoCobrado() {
  const unidad = await unidadLibre("DEPA 2R (tipo 717)");
  await prisma.proyecto.update({ where: { id: unidad.proyectoId }, data: { stripeConnectedAccountId: "acct_moretti" } });
  const { plan } = await darDeAlta({ nombre: "C", contacto: "81", unidadId: unidad.id, paqueteId: (await paquete("casa-lista")).id });
  await firmarContrato(unidad.id);
  await cobrarAnticipo(plan.id, { pasarela: crearPasarelaFalsa() });
  return unidad.proyectoId;
}

beforeEach(baseLimpiaConCatalogo);

describe("D-34 · la plataforma retiene y Ana Cris autoriza pagar a Moretti", () => {
  it("lo cobrado queda retenido; al autorizar se transfiere el neto (menos comisión) una sola vez", async () => {
    const proyectoId = await anticipoCobrado();
    const antes = (await retenidoPorProyecto()).find((r) => r.proyectoId === proyectoId)!;
    expect(antes.pagos).toBe(1);
    expect(antes.bruto).toBe(44190);
    expect(antes.neto).toBeCloseTo(antes.bruto - antes.comision, 2);

    const pasarela = crearPasarelaFalsa();
    const t = await autorizarTransferencia({ proyectoId, autorizadaPor: "Ana Cris" }, { pasarela });
    expect(t.neto).toBeCloseTo(antes.neto, 2);

    expect((await retenidoPorProyecto()).find((r) => r.proyectoId === proyectoId)!.pagos).toBe(0);
    await expect(autorizarTransferencia({ proyectoId, autorizadaPor: "Ana Cris" }, { pasarela })).rejects.toThrow(
      "No hay nada retenido de este proyecto."
    );
    const evento = await prisma.evento.findFirstOrThrow({ where: { tipo: "transferencia_enviada" } });
    expect(evento.comentario).toMatch(/^Ana Cris autorizó pagar a Moretti/);
  });

  it("si la pasarela rechaza la transferencia, los pagos vuelven a quedar retenidos", async () => {
    const proyectoId = await anticipoCobrado();
    const pasarela = crearPasarelaFalsa({ decidirTransferencia: () => ({ estado: "fallido", mensaje: "saldo insuficiente" }) });
    await expect(autorizarTransferencia({ proyectoId, autorizadaPor: "Ana Cris" }, { pasarela })).rejects.toThrow(/saldo insuficiente/);
    expect((await retenidoPorProyecto()).find((r) => r.proyectoId === proyectoId)!.pagos).toBe(1);
    expect(await prisma.transferenciaMoretti.count({ where: { estado: "FALLIDA" } })).toBe(1);
  });

  it("si la pasarela no contesta, el reintento usa la misma transferencia (no paga dos veces)", async () => {
    const proyectoId = await anticipoCobrado();
    const ids: string[] = [];
    let caida = true;
    const base = crearPasarelaFalsa();
    const pasarela: Pasarela = {
      ...base,
      cobrar: base.cobrar,
      prepararTarjeta: base.prepararTarjeta,
      async transferir(s) {
        ids.push(s.transferenciaId);
        if (caida) throw new Error("ECONNRESET");
        return base.transferir(s);
      },
    };
    await expect(autorizarTransferencia({ proyectoId, autorizadaPor: "Ana Cris" }, { pasarela })).rejects.toThrow(/no contestó/);
    caida = false;
    await autorizarTransferencia({ proyectoId, autorizadaPor: "Ana Cris" }, { pasarela });
    expect(new Set(ids).size).toBe(1);
    expect(await prisma.transferenciaMoretti.count()).toBe(1);
  });

  it("sin cuenta de Moretti configurada no se autoriza", async () => {
    const proyectoId = await anticipoCobrado();
    await prisma.proyecto.update({ where: { id: proyectoId }, data: { stripeConnectedAccountId: null } });
    await expect(autorizarTransferencia({ proyectoId, autorizadaPor: "Ana Cris" })).rejects.toThrow(/no tiene configurada la cuenta/);
  });
});
