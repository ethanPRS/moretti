import { beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { pasarelaStripe } from "./stripe";
import { llaveIdempotencia } from "./contrato";
import { cobrarAnticipo, darDeAlta, prepararTarjeta, registrarTarjeta } from "@/lib/motor/planes";
import { cobrarVencidas } from "@/lib/motor/barrido";
import { autorizarTransferencia } from "@/lib/motor/transferencias";
import { baseLimpiaConCatalogo, eventosDelPlan, firmarContrato, paquete, unidadLibre } from "@/pruebas/utilidades";

/**
 * De extremo a extremo contra el modo prueba de Stripe: `npm run test:stripe`.
 *
 * Necesita en .env:
 * - STRIPE_SECRET_KEY=sk_test_…
 * - STRIPE_E2E_CUENTA=acct_… una cuenta conectada de prueba con pagos con
 *   tarjeta activos (Dashboard › Connect). Es la «cuenta de Moretti»: con D-34
 *   sólo recibe la transferencia; los cargos viven en la plataforma.
 *
 * El recorrido: guardar tarjeta → anticipo en la plataforma (D-34) → cambiar a
 * una tarjeta que se guarda pero rechaza los cargos (4000 0000 0000 0341) →
 * el barrido cobra la mensualidad vencida y el banco la rechaza → el
 * comprador registra otra tarjeta → el barrido la reintenta con llave nueva y
 * se cobra una sola vez → Ana Cris autoriza la transferencia a Moretti.
 *
 * No prueba el webhook: para eso, `stripe listen` (docs/integracion-stripe.md).
 * El motor no lo necesita para aplicar estos cobros: la respuesta de Stripe
 * llega primero, y el webhook que llegue después no duplica nada.
 */

const llave = process.env.STRIPE_SECRET_KEY ?? "";
const cuenta = process.env.STRIPE_E2E_CUENTA ?? "";
const configurado = llave.startsWith("sk_test_") && cuenta.startsWith("acct_");

describe.skipIf(!configurado)("Stripe modo prueba · un rechazo y su reintento", () => {
  const stripe = new Stripe(llave);
  let planId: string;

  beforeAll(async () => {
    await baseLimpiaConCatalogo();
    const unidad = await unidadLibre("DEPA 2R (tipo 717)");
    await prisma.proyecto.update({ where: { id: unidad.proyectoId }, data: { stripeConnectedAccountId: cuenta } });
    const { plan } = await darDeAlta({
      nombre: "Comprador E2E",
      contacto: "e2e@example.com",
      unidadId: unidad.id,
      paqueteId: (await paquete("confort")).id,
    });
    await firmarContrato(unidad.id);
    planId = plan.id;
  });

  /** Lo que haría el navegador con Stripe Elements, del lado del servidor y con una tarjeta de prueba. */
  async function registrar(tarjetaDePrueba: string) {
    const { clientSecret } = await prepararTarjeta({ planId, consentimiento: true }, { pasarela: pasarelaStripe });
    const setupIntentId = clientSecret.split("_secret_")[0];
    await stripe.setupIntents.confirm(setupIntentId, { payment_method: tarjetaDePrueba });
    return registrarTarjeta({ planId, referenciaPreparacion: setupIntentId }, { pasarela: pasarelaStripe });
  }

  const mensualidad1 = () =>
    prisma.exhibicion.findFirstOrThrow({ where: { planId, numero: 1 }, include: { pago: true } });

  it("guarda la tarjeta y cobra el anticipo en la plataforma, sin application fee (D-34)", async () => {
    expect((await registrar("pm_card_visa")).descripcion).toMatch(/4242/);

    const r = await cobrarAnticipo(planId, { pasarela: pasarelaStripe });
    expect(r.estado).toBe("exitoso");
    if (r.estado !== "exitoso") return;

    const pi = await stripe.paymentIntents.retrieve(r.referencia);
    const anticipo = await prisma.exhibicion.findFirstOrThrow({ where: { planId, numero: 0 }, include: { pago: true } });
    expect(pi.status).toBe("succeeded");
    expect(pi.amount).toBe(Math.round(Number(anticipo.monto) * 100));
    // La comisión no es application fee: es lo que no se le transfiere a Moretti.
    expect(pi.application_fee_amount).toBeNull();
    expect(pi.transfer_data).toBeNull();
    expect(pi.metadata).toMatchObject({
      planId,
      numeroExhibicion: "0",
      intento: "1",
      comisionCentavos: String(Math.round(Number(anticipo.pago!.montoComision) * 100)),
    });
  });

  it("la mensualidad vencida se cobra fuera de sesión, el banco la rechaza y queda en la bitácora", async () => {
    await registrar("pm_card_chargeCustomerFail"); // 4000 0000 0000 0341
    await prisma.exhibicion.updateMany({
      where: { planId, numero: 1 },
      data: { fechaProgramada: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const r = await cobrarVencidas({ pasarela: pasarelaStripe });

    expect(r).toMatchObject({ rechazadas: 1, cobradas: 0, errores: [] });
    const m1 = await mensualidad1();
    expect(m1).toMatchObject({ estado: "VENCIDA", intentosRechazados: 1, pago: null, ultimoCodigoRechazo: "generic_decline" });
    // generic_decline: un reintento a los 2 días (rechazos.ts).
    expect(m1.requiereTarjetaNueva).toBe(false);
    expect(m1.proximoIntentoEn!.getTime()).toBeGreaterThan(Date.now() + 2 * 24 * 60 * 60 * 1000 - 60_000);
    const rechazo = (await eventosDelPlan(planId)).find((e) => e.tipo === "cobro_rechazado");
    expect(rechazo?.comentario).toMatch(/mensualidad 1.*intento 1.*generic_decline/);
  });

  it("con otra tarjeta, el barrido la reintenta con llave nueva y se cobra una sola vez", async () => {
    // Registrar otra tarjeta la regresa al barrido sin esperar los 2 días.
    await registrar("pm_card_visa");
    expect((await mensualidad1()).proximoIntentoEn).toBeNull();

    const r = await cobrarVencidas({ pasarela: pasarelaStripe });
    expect(r).toMatchObject({ cobradas: 1, rechazadas: 0 });

    const m1 = await mensualidad1();
    expect(m1.estado).toBe("PAGADA");
    const pi = await stripe.paymentIntents.retrieve(m1.pago!.referenciaStripe!);
    expect(pi.metadata.intento).toBe("2");

    // Mandar otra vez el mismo intento devuelve el mismo cargo: Stripe reconoce la llave.
    const otraVez = await pasarelaStripe.cobrar({
      planId,
      exhibicionId: m1.id,
      numeroExhibicion: 1,
      intento: 2,
      montoCentavos: pi.amount,
      comisionCentavos: Number(pi.metadata.comisionCentavos),
      compradorId: (await prisma.plan.findUniqueOrThrow({ where: { id: planId } })).compradorId,
      proyectoId: (await prisma.unidad.findFirstOrThrow({ where: { comprador: { planes: { some: { id: planId } } } } }))
        .proyectoId,
      compradorPresente: false,
    });
    expect(otraVez).toEqual({ estado: "exitoso", referenciaPasarela: pi.id });
    expect(llaveIdempotencia({ planId, numeroExhibicion: 1, intento: 2 })).toBe(`plan_${planId}:exh_1:int_2`);
    expect(await prisma.pago.count({ where: { exhibicionId: m1.id } })).toBe(1);
  });

  it("Ana Cris autoriza y la plataforma le transfiere a Moretti el neto (D-34)", async () => {
    const proyectoId = (await prisma.unidad.findFirstOrThrow({ where: { comprador: { planes: { some: { id: planId } } } } }))
      .proyectoId;
    const t = await autorizarTransferencia({ proyectoId, autorizadaPor: "Prueba E2E" }, { pasarela: pasarelaStripe });
    // En modo prueba, lo cobrado con 4242 queda «pending»: si Stripe contesta
    // saldo insuficiente, cobrar con pm_card_bypassPending (docs/integracion-stripe.md).
    const transfer = await stripe.transfers.retrieve(t.referencia);
    expect(transfer.destination).toBe(cuenta);
    expect(transfer.amount).toBe(Math.round(Number(t.neto) * 100));
    expect(transfer.transfer_group).toBe(`proyecto_${proyectoId}`);
  });
});
