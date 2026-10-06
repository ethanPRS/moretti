import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { crearPasarelaFalsa } from "@/lib/pasarela/falsa";
import { marcarComprobanteEmitido } from "./comprobantes";
import { fechaLimiteComprobante } from "./fiscal";
import { cobrarAnticipo, cobrarExhibicion, confirmarCobroStripe, darDeAlta } from "./planes";
import { ejecutarAdelanto } from "./versiones";
import { baseLimpiaConCatalogo, firmarContrato, paquete, unidadLibre } from "@/pruebas/utilidades";

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

beforeEach(baseLimpiaConCatalogo);

describe("S · cada pago nace con su comprobante pendiente", () => {
  it("anticipo, mensualidad y adelanto: uno por pago, con la fecha límite correcta", async () => {
    const { plan, pasarela } = await planActivo();
    const primera = await prisma.exhibicion.findFirstOrThrow({ where: { planId: plan.id, numero: 1 } });
    await cobrarExhibicion(primera.id, { pasarela });
    await ejecutarAdelanto({ planId: plan.id, monto: 20000 }, { pasarela });

    const pagos = await prisma.pago.findMany({ where: { planId: plan.id }, include: { comprobante: true } });
    expect(pagos).toHaveLength(3);
    for (const p of pagos) {
      expect(p.comprobante).toMatchObject({ estado: "PENDIENTE", planId: plan.id });
      expect(Number(p.comprobante!.monto)).toBe(Number(p.monto));
      expect(p.comprobante!.fechaLimite).toEqual(fechaLimiteComprobante(p.fecha));
    }
    const eventos = await prisma.evento.count({ where: { entidadId: plan.id, tipo: "comprobante_pendiente" } });
    expect(eventos).toBe(3);
  });

  it("también por el camino de Stripe (webhook)", async () => {
    const unidad = await unidadLibre("DEPA 2R (tipo 717)");
    const { plan } = await darDeAlta({
      nombre: "Stripe",
      contacto: "81",
      unidadId: unidad.id,
      paqueteId: (await paquete("casa-lista")).id,
    });
    await firmarContrato(unidad.id);
    const anticipo = await prisma.exhibicion.findFirstOrThrow({ where: { planId: plan.id, numero: 0 } });
    await prisma.intentoCobro.create({
      data: {
        exhibicionId: anticipo.id,
        planId: plan.id,
        idempotencyKey: "fiscal-stripe",
        stripePaymentIntentId: "pi_fiscal",
        stripeAccountId: "acct_prueba",
        monto: anticipo.monto,
        porcentajeComision: 0.1,
        montoComision: 0,
      },
    });
    await confirmarCobroStripe({ paymentIntentId: "pi_fiscal", stripeAccountId: "acct_prueba" });
    // El mismo webhook dos veces: un solo pago, un solo pendiente.
    await confirmarCobroStripe({ paymentIntentId: "pi_fiscal", stripeAccountId: "acct_prueba" });
    expect(await prisma.comprobanteFiscal.count({ where: { planId: plan.id } })).toBe(1);
  });

  it("se cierra con el folio fiscal; un folio mal formado o un segundo cierre no proceden", async () => {
    const { plan } = await planActivo();
    const pendiente = await prisma.comprobanteFiscal.findFirstOrThrow({ where: { planId: plan.id } });

    await expect(marcarComprobanteEmitido({ id: pendiente.id, folioFiscal: "123" })).rejects.toThrow(/UUID del CFDI/);
    await marcarComprobanteEmitido({ id: pendiente.id, folioFiscal: "6f9619ff-8b86-d011-b42d-00c04fc964ff" });
    const emitido = await prisma.comprobanteFiscal.findUniqueOrThrow({ where: { id: pendiente.id } });
    expect(emitido).toMatchObject({ estado: "EMITIDO", folioFiscal: "6F9619FF-8B86-D011-B42D-00C04FC964FF" });
    await expect(
      marcarComprobanteEmitido({ id: pendiente.id, folioFiscal: "6F9619FF-8B86-D011-B42D-00C04FC964FF" })
    ).rejects.toThrow("Ese comprobante ya estaba emitido o no existe.");
  });
});
