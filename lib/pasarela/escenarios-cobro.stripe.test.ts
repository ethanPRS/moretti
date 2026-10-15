import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { mkdirSync, writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { pasarelaStripe } from "./stripe";
import { llaveIdempotencia } from "./contrato";
import { cobrarAnticipo, darDeAlta, prepararTarjeta, registrarTarjeta } from "@/lib/motor/planes";
import { cobrarVencidas } from "@/lib/motor/barrido";
import { ejecutarAdelanto, ejecutarLiquidacion } from "@/lib/motor/versiones";
import { reembolsarPago } from "@/lib/motor/movimientos";
import { autorizarTransferencia } from "@/lib/motor/transferencias";
import { resumenCobranza } from "@/lib/motor/cobranza";
import { baseLimpiaConCatalogo, eventosDelPlan, firmarContrato, paquete, unidadLibre } from "@/pruebas/utilidades";

/**
 * Los once escenarios de cobro (hoja «Escenarios» del Excel 15 · Stripe para
 * programar) contra el modo prueba de Stripe: `npm run test:stripe`.
 *
 * - Cobros, reembolsos, disputas y transferencias son reales en Stripe (test).
 * - Los webhooks: se toma el evento REAL que generó Stripe (events.list), se
 *   firma con un secreto local y se entrega a la ruta /api/stripe/webhook.
 *   Así se prueba la ruta completa sin depender de `stripe listen`.
 * - Una tarjeta que «se echa a perder» después de guardada se simula
 *   apuntando el comprador a un token de prueba de Stripe
 *   (pm_card_chargeDeclined…): Stripe contesta el rechazo real.
 * - Cada escenario deja su evidencia en evidencias/datos/*.json.
 */

const llave = process.env.STRIPE_SECRET_KEY ?? "";
const cuenta = process.env.STRIPE_E2E_CUENTA ?? "";
const configurado = llave.startsWith("sk_test_") && cuenta.startsWith("acct_");
const SECRETO_WEBHOOK = "whsec_pruebas_escenarios_locales";
process.env.STRIPE_WEBHOOK_SECRET = SECRETO_WEBHOOK;

const stripe = new Stripe(llave || "sk_test_x");
const DIA = 24 * 60 * 60 * 1000;
const inicioCorrida = Math.floor(Date.now() / 1000) - 60;

// ─── Evidencia ──────────────────────────────────────────────────────────
type Paso = { titulo: string; datos: unknown };
const evidencia: Record<string, Paso[]> = {};
function anotar(escenario: string, titulo: string, datos: unknown) {
  (evidencia[escenario] ??= []).push({ titulo, datos });
}
afterAll(() => {
  mkdirSync("evidencias/datos", { recursive: true });
  for (const [esc, pasos] of Object.entries(evidencia)) {
    writeFileSync(`evidencias/datos/${esc}.json`, JSON.stringify(pasos, null, 2));
  }
});

// ─── Utilidades ─────────────────────────────────────────────────────────
const resumenPI = (pi: Stripe.PaymentIntent) => ({
  id: pi.id,
  status: pi.status,
  amount: pi.amount,
  currency: pi.currency,
  customer: pi.customer,
  capture_method: pi.capture_method,
  transfer_group: pi.transfer_group,
  application_fee_amount: pi.application_fee_amount,
  description: pi.description,
  metadata: pi.metadata,
  last_payment_error: pi.last_payment_error
    ? { code: pi.last_payment_error.code, decline_code: pi.last_payment_error.decline_code }
    : null,
});

async function nuevoPlan(opciones: { clave?: string; paqueteSlug?: string; nombre?: string } = {}) {
  const unidad = await unidadLibre(opciones.clave ?? "DEPA 2R (tipo 717)");
  await prisma.proyecto.update({ where: { id: unidad.proyectoId }, data: { stripeConnectedAccountId: cuenta } });
  const { plan, comprador } = await darDeAlta({
    nombre: opciones.nombre ?? "Comprador Escenarios",
    contacto: "escenarios@example.com",
    unidadId: unidad.id,
    paqueteId: (await paquete(opciones.paqueteSlug ?? "confort")).id,
  });
  await firmarContrato(unidad.id);
  return { planId: plan.id, compradorId: comprador.id, proyectoId: unidad.proyectoId };
}

/** Lo que haría el navegador con Stripe Elements, con una tarjeta de prueba. */
async function registrar(planId: string, tarjeta: string) {
  const { clientSecret } = await prepararTarjeta({ planId, consentimiento: true }, { pasarela: pasarelaStripe });
  const setupIntentId = clientSecret.split("_secret_")[0];
  await stripe.setupIntents.confirm(setupIntentId, { payment_method: tarjeta });
  return registrarTarjeta({ planId, referenciaPreparacion: setupIntentId }, { pasarela: pasarelaStripe });
}

const exh = (planId: string, numero: number) =>
  prisma.exhibicion.findFirstOrThrow({
    where: { planId, numero, estado: { notIn: ["REEMPLAZADA", "CANCELADA"] } },
    include: { pago: true },
    orderBy: { version: "desc" },
  });

async function vencer(planId: string, numero: number) {
  await prisma.exhibicion.updateMany({
    where: { planId, numero },
    data: { fechaProgramada: new Date(Date.now() - DIA) },
  });
}

/** Una tarjeta guardada que después el banco empieza a rechazar. */
async function tarjetaQueRechaza(compradorId: string, token: string) {
  await prisma.comprador.update({ where: { id: compradorId }, data: { stripePaymentMethodId: token } });
}

async function esperar<T>(que: string, f: () => Promise<T | null | undefined>, ms = 90_000): Promise<T> {
  const hasta = Date.now() + ms;
  for (;;) {
    const x = await f();
    if (x) return x;
    if (Date.now() > hasta) throw new Error(`Se agotó la espera: ${que}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** El evento real que Stripe generó para el objeto. */
async function eventoDe(tipo: string, objetoId: string) {
  return esperar(`evento ${tipo} de ${objetoId}`, async () => {
    const lista = await stripe.events.list({ type: tipo, created: { gte: inicioCorrida }, limit: 100 });
    return lista.data.find((e) => (e.data.object as { id: string }).id === objetoId);
  });
}

/** Firma el evento y lo entrega a la ruta del webhook, como lo haría Stripe. */
async function entregar(evento: Stripe.Event | Record<string, unknown>) {
  const { POST } = await import("@/app/api/stripe/webhook/route");
  const payload = JSON.stringify(evento);
  const firma = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRETO_WEBHOOK });
  const res = await POST(
    new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: payload,
      headers: { "stripe-signature": firma, "content-type": "application/json" },
    }) as never
  );
  return { status: res.status, cuerpo: await res.json() };
}

// ════════════════════════════════════════════════════════════════════════
describe.skipIf(!configurado)("Escenarios de cobro contra Stripe (modo prueba)", () => {
  beforeAll(async () => {
    await baseLimpiaConCatalogo();
  });

  // ── E1 ────────────────────────────────────────────────────────────────
  describe("E1 · Anticipo del 30%", () => {
    let p: Awaited<ReturnType<typeof nuevoPlan>>;
    beforeAll(async () => {
      p = await nuevoPlan();
    });

    it("sin contrato firmado no se cobra (R1)", async () => {
      const unidad = await unidadLibre("DEPA 2R (tipo 717)");
      const { plan } = await darDeAlta({
        nombre: "Sin contrato",
        contacto: "sin@example.com",
        unidadId: unidad.id,
        paqueteId: (await paquete("confort")).id,
      });
      await expect(cobrarAnticipo(plan.id, { pasarela: pasarelaStripe })).rejects.toThrow(/contrato firmado/);
      anotar("E1", "R1: sin contrato no se cobra", { planId: plan.id, resultado: "ReglaError: falta el contrato firmado" });
    });

    it("guarda la tarjeta (SetupIntent off_session) con la autorización del comprador", async () => {
      const t = await registrar(p.planId, "pm_card_visa");
      const comprador = await prisma.comprador.findUniqueOrThrow({ where: { id: p.compradorId } });
      expect(t.descripcion).toMatch(/4242/);
      expect(comprador.stripeCustomerId).toMatch(/^cus_/);
      expect(comprador.stripePaymentMethodId).toMatch(/^pm_/);
      const sis = await stripe.setupIntents.list({ customer: comprador.stripeCustomerId!, limit: 1 });
      expect(sis.data[0]).toMatchObject({ status: "succeeded", usage: "off_session" });
      expect(sis.data[0].metadata?.consentimiento).toBe("cargos_mensualidades_fuera_de_sesion");
      anotar("E1", "Tarjeta guardada en la plataforma (SetupIntent)", {
        customer: comprador.stripeCustomerId,
        payment_method: comprador.stripePaymentMethodId,
        setup_intent: { id: sis.data[0].id, status: sis.data[0].status, usage: sis.data[0].usage, metadata: sis.data[0].metadata },
        tarjeta: t,
      });
    });

    it("cobra el anticipo, congela el precio y deja el plan de doce exhibiciones", async () => {
      const r = await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
      expect(r.estado).toBe("exitoso");
      if (r.estado !== "exitoso") return;
      const pi = await stripe.paymentIntents.retrieve(r.referencia);
      const plan = await prisma.plan.findUniqueOrThrow({
        where: { id: p.planId },
        include: { exhibiciones: { orderBy: { numero: "asc" } }, renglones: true },
      });
      const anticipo = plan.exhibiciones[0];
      const pago = await prisma.pago.findUniqueOrThrow({ where: { exhibicionId: anticipo.id } });

      expect(pi.status).toBe("succeeded");
      expect(pi.amount).toBe(Math.round(Number(anticipo.monto) * 100));
      expect(Number(anticipo.monto)).toBeCloseTo(Number(plan.montoCongelado) * 0.3, 0);
      expect(plan.fechaCongelamiento).not.toBeNull();
      expect(plan.estado).toBe("ACTIVO");
      expect(plan.exhibiciones.filter((e) => e.tipo === "MENSUALIDAD")).toHaveLength(12);
      // R7: anticipo + 12 = precio congelado.
      const suma = plan.exhibiciones.reduce((a, e) => a + Math.round(Number(e.monto) * 100), 0);
      expect(suma).toBe(Math.round(Number(plan.montoCongelado) * 100));
      // D-34: sin application fee; la comisión va en metadata y en el Pago.
      expect(pi.application_fee_amount).toBeNull();
      expect(pi.metadata.comisionCentavos).toBe(String(Math.round(Number(pago.montoComision) * 100)));
      expect(pi.transfer_group).toBe(`proyecto_${p.proyectoId}`);

      anotar("E1", "PaymentIntent del anticipo", resumenPI(pi));
      anotar("E1", "Plan congelado en la base", {
        estado: plan.estado,
        montoCongelado: plan.montoCongelado,
        fechaCongelamiento: plan.fechaCongelamiento,
        exhibiciones: plan.exhibiciones.map((e) => ({ n: e.numero, tipo: e.tipo, monto: e.monto, fecha: e.fechaProgramada, estado: e.estado })),
        sumaR7Centavos: suma,
        pago: { monto: pago.monto, porcentajeComision: pago.porcentajeComision, montoComision: pago.montoComision },
      });
    });

    it("el webhook payment_intent.succeeded real se acepta y no duplica el pago (ni reenviado)", async () => {
      const anticipo = await exh(p.planId, 0);
      const evento = await eventoDe("payment_intent.succeeded", anticipo.pago!.referenciaStripe!);
      const primero = await entregar(evento);
      const reenvio = await entregar(evento);
      expect(primero.status).toBe(200);
      expect(reenvio).toMatchObject({ status: 200, cuerpo: { duplicate: true } });
      expect(await prisma.pago.count({ where: { exhibicionId: anticipo.id } })).toBe(1);
      const guardado = await prisma.eventoStripe.findUniqueOrThrow({ where: { stripeEventId: evento.id } });
      expect(guardado.procesado).toBe(true);
      anotar("E1", "Webhook payment_intent.succeeded (real, entregado dos veces)", {
        evento: evento.id,
        primeraEntrega: primero,
        reenvio,
        eventoStripe: { procesado: guardado.procesado, nota: guardado.error },
        pagosDeLaExhibicion: 1,
      });
    });

    it("una firma inválida se rechaza con 400", async () => {
      const { POST } = await import("@/app/api/stripe/webhook/route");
      const res = await POST(
        new Request("http://localhost:3000/api/stripe/webhook", {
          method: "POST",
          body: "{}",
          headers: { "stripe-signature": "t=1,v1=firmafalsa" },
        }) as never
      );
      expect(res.status).toBe(400);
      anotar("E1", "Webhook con firma falsa", { status: res.status, cuerpo: await res.json() });
    });
  });

  // ── E2 ────────────────────────────────────────────────────────────────
  describe("E2 · Mensualidad programada", () => {
    let p: Awaited<ReturnType<typeof nuevoPlan>>;
    beforeAll(async () => {
      await baseLimpiaConCatalogo();
      p = await nuevoPlan();
      await registrar(p.planId, "pm_card_visa");
      await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
    });

    it("el barrido cobra fuera de sesión sólo la mensualidad vencida; dos barridos a la vez = un cargo", async () => {
      await vencer(p.planId, 1);
      const [a, b] = await Promise.all([
        cobrarVencidas({ pasarela: pasarelaStripe }),
        cobrarVencidas({ pasarela: pasarelaStripe }),
      ]);
      expect(a.cobradas + b.cobradas).toBe(1);
      const m1 = await exh(p.planId, 1);
      const m2 = await exh(p.planId, 2);
      expect(m1.estado).toBe("PAGADA");
      expect(m2.estado).toBe("PENDIENTE");
      const pi = await stripe.paymentIntents.retrieve(m1.pago!.referenciaStripe!, { expand: ["latest_charge"] });
      expect(pi.status).toBe("succeeded");
      expect(pi.metadata).toMatchObject({ numeroExhibicion: "1", intento: "1" });
      expect(pi.capture_method).toBe("automatic");
      const charges = await stripe.charges.list({ payment_intent: pi.id });
      expect(charges.data).toHaveLength(1);
      anotar("E2", "Barridos simultáneos", { barridoA: a, barridoB: b });
      anotar("E2", "PaymentIntent de la mensualidad 1 (off_session)", resumenPI(pi));
      anotar("E2", "Estado de las exhibiciones", { m1: { estado: m1.estado, pago: m1.pago?.referenciaStripe }, m2: { estado: m2.estado } });
    });

    it("mismo intento otra vez → Stripe devuelve el mismo PaymentIntent (idempotencia)", async () => {
      const m1 = await exh(p.planId, 1);
      const pi = await stripe.paymentIntents.retrieve(m1.pago!.referenciaStripe!);
      const otraVez = await pasarelaStripe.cobrar({
        planId: p.planId,
        exhibicionId: m1.id,
        numeroExhibicion: 1,
        intento: 1,
        montoCentavos: pi.amount,
        comisionCentavos: Number(pi.metadata.comisionCentavos),
        compradorId: p.compradorId,
        proyectoId: p.proyectoId,
        compradorPresente: false,
      });
      expect(otraVez).toEqual({ estado: "exitoso", referenciaPasarela: pi.id });
      const llave = llaveIdempotencia({ planId: p.planId, numeroExhibicion: 1, intento: 1 });
      anotar("E2", "Reenvío con la misma llave de idempotencia", { llave, respuesta: otraVez, mismoPaymentIntent: pi.id });
    });

    it("Stripe no sabe que existe un plan: el cliente no tiene suscripciones ni Billing", async () => {
      const comprador = await prisma.comprador.findUniqueOrThrow({ where: { id: p.compradorId } });
      const subs = await stripe.subscriptions.list({ customer: comprador.stripeCustomerId!, status: "all" });
      const sched = await stripe.subscriptionSchedules.list({ customer: comprador.stripeCustomerId! });
      expect(subs.data).toHaveLength(0);
      expect(sched.data).toHaveLength(0);
      anotar("E2", "Objetos de Billing del cliente", { suscripciones: subs.data.length, calendarios: sched.data.length });
    });
  });

  // ── E3 ────────────────────────────────────────────────────────────────
  describe("E3 · El cargo rebota", () => {
    beforeAll(async () => {
      await baseLimpiaConCatalogo();
    });

    it("tarjetas que el banco rechaza al guardarlas (9995, robada, vencida) no se registran", async () => {
      const p = await nuevoPlan();
      const casos: Record<string, string> = {};
      for (const pm of ["pm_card_chargeDeclinedInsufficientFunds", "pm_card_chargeDeclinedStolenCard", "pm_card_chargeDeclinedExpiredCard"]) {
        await expect(registrar(p.planId, pm)).rejects.toThrow();
        try {
          await registrar(p.planId, pm);
        } catch (e) {
          casos[pm] = (e as Error).message;
        }
      }
      const comprador = await prisma.comprador.findUniqueOrThrow({ where: { id: p.compradorId } });
      expect(comprador.stripePaymentMethodId).toBeNull();
      anotar("E3", "Tarjetas rechazadas al guardarlas", casos);
    });

    it("insufficient_funds: reintenta a los 3 y a los 7 días con llave nueva; después pide otra tarjeta", async () => {
      await baseLimpiaConCatalogo();
      const p = await nuevoPlan();
      await registrar(p.planId, "pm_card_visa");
      await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
      await tarjetaQueRechaza(p.compradorId, "pm_card_chargeDeclinedInsufficientFunds");
      await vencer(p.planId, 1);

      const intentos = [];
      let ahora = new Date();
      for (let i = 1; i <= 3; i++) {
        const r = await cobrarVencidas({ pasarela: pasarelaStripe, ahora });
        const m1 = await exh(p.planId, 1);
        intentos.push({
          intento: i,
          barrido: { rechazadas: r.rechazadas, cobradas: r.cobradas },
          estado: m1.estado,
          ultimoCodigoRechazo: m1.ultimoCodigoRechazo,
          intentosRechazados: m1.intentosRechazados,
          proximoIntentoEn: m1.proximoIntentoEn,
          requiereTarjetaNueva: m1.requiereTarjetaNueva,
          llave: llaveIdempotencia({ planId: p.planId, numeroExhibicion: 1, intento: i }),
        });
        expect(r.rechazadas).toBe(1);
        expect(m1).toMatchObject({ estado: "VENCIDA", ultimoCodigoRechazo: "insufficient_funds", intentosRechazados: i, pago: null });
        if (i === 1) expect(m1.proximoIntentoEn!.getTime()).toBeGreaterThan(Date.now() + 3 * DIA - 120_000);
        if (i === 2) expect(m1.proximoIntentoEn!.getTime()).toBeGreaterThan(Date.now() + 7 * DIA - 120_000);
        if (i === 3) expect(m1.requiereTarjetaNueva).toBe(true);
        // Antes de su fecha de reintento, el barrido no la toca.
        if (m1.proximoIntentoEn) {
          const antes = await cobrarVencidas({ pasarela: pasarelaStripe, ahora: new Date(m1.proximoIntentoEn.getTime() - DIA) });
          expect(antes.revisadas).toBe(0);
          ahora = new Date(m1.proximoIntentoEn.getTime() + 60_000);
        }
      }
      // Ya no la cobra sola.
      const despues = await cobrarVencidas({ pasarela: pasarelaStripe, ahora: new Date(Date.now() + 30 * DIA) });
      expect(despues.revisadas).toBe(0);

      const pis = await stripe.paymentIntents.search({ query: `metadata['planId']:'${p.planId}' AND metadata['numeroExhibicion']:'1'` }).catch(() => null);
      const bitacora = (await eventosDelPlan(p.planId)).filter((e) => e.tipo === "cobro_rechazado").map((e) => e.comentario);
      expect(bitacora).toHaveLength(3);
      anotar("E3", "insufficient_funds: tres intentos", { intentos, bitacora, paymentIntentsEnStripe: pis?.data.map(resumenPI) ?? "búsqueda no disponible aún" });
    });

    it("generic_decline (4000 0000 0000 0341): un reintento a los 2 días; con otra tarjeta se cobra una vez", async () => {
      await baseLimpiaConCatalogo();
      const p = await nuevoPlan();
      await registrar(p.planId, "pm_card_visa");
      await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
      await registrar(p.planId, "pm_card_chargeCustomerFail");
      await vencer(p.planId, 1);

      const r1 = await cobrarVencidas({ pasarela: pasarelaStripe });
      const m1 = await exh(p.planId, 1);
      expect(r1.rechazadas).toBe(1);
      expect(m1).toMatchObject({ estado: "VENCIDA", ultimoCodigoRechazo: "generic_decline", requiereTarjetaNueva: false });
      expect(m1.proximoIntentoEn!.getTime()).toBeGreaterThan(Date.now() + 2 * DIA - 120_000);

      await registrar(p.planId, "pm_card_visa");
      const r2 = await cobrarVencidas({ pasarela: pasarelaStripe });
      const pagada = await exh(p.planId, 1);
      expect(r2.cobradas).toBe(1);
      expect(pagada.estado).toBe("PAGADA");
      const pi = await stripe.paymentIntents.retrieve(pagada.pago!.referenciaStripe!);
      expect(pi.metadata.intento).toBe("2");
      anotar("E3", "generic_decline y cobro con tarjeta nueva", {
        rechazo: { barrido: r1, ultimoCodigoRechazo: m1.ultimoCodigoRechazo, proximoIntentoEn: m1.proximoIntentoEn },
        cobro: { barrido: r2, paymentIntent: resumenPI(pi) },
      });
    });

    it("stolen_card: no reintenta y la tarjeta queda inválida para todo el plan", async () => {
      await baseLimpiaConCatalogo();
      const p = await nuevoPlan();
      await registrar(p.planId, "pm_card_visa");
      await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
      await tarjetaQueRechaza(p.compradorId, "pm_card_chargeDeclinedStolenCard");
      await vencer(p.planId, 1);
      await vencer(p.planId, 2);

      const r = await cobrarVencidas({ pasarela: pasarelaStripe });
      const comprador = await prisma.comprador.findUniqueOrThrow({ where: { id: p.compradorId } });
      const m1 = await exh(p.planId, 1);
      expect(r.rechazadas).toBe(1); // la 2 ya no se intenta: tarjeta inválida
      expect(m1.ultimoCodigoRechazo).toBe("stolen_card");
      expect(comprador.tarjetaInvalida).toBe(true);
      const otra = await cobrarVencidas({ pasarela: pasarelaStripe, ahora: new Date(Date.now() + 30 * DIA) });
      expect(otra.revisadas).toBe(0);
      anotar("E3", "stolen_card", { barrido: r, tarjetaInvalida: comprador.tarjetaInvalida, m1: { estado: m1.estado, codigo: m1.ultimoCodigoRechazo }, barridoSiguiente: otra });
    });

    it("expired_card y authentication_required: piden tarjeta nueva, no reintentan solos", async () => {
      const casos: Record<string, unknown> = {};
      for (const [token, codigo] of [
        ["pm_card_chargeDeclinedExpiredCard", "expired_card"],
        ["pm_card_authenticationRequired", "authentication_required"],
      ] as const) {
        await baseLimpiaConCatalogo();
        const p = await nuevoPlan();
        await registrar(p.planId, "pm_card_visa");
        await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
        await tarjetaQueRechaza(p.compradorId, token);
        await vencer(p.planId, 1);
        const r = await cobrarVencidas({ pasarela: pasarelaStripe });
        const m1 = await exh(p.planId, 1);
        expect(r.rechazadas).toBe(1);
        expect(m1).toMatchObject({ ultimoCodigoRechazo: codigo, requiereTarjetaNueva: true });
        casos[codigo] = { barrido: r, estado: m1.estado, requiereTarjetaNueva: m1.requiereTarjetaNueva };
      }
      anotar("E3", "expired_card y authentication_required", casos);
    });

    it("dos mensualidades vencidas suspenden el plan; al cobrarlas se reactiva", async () => {
      await baseLimpiaConCatalogo();
      const p = await nuevoPlan();
      await registrar(p.planId, "pm_card_visa");
      await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
      await registrar(p.planId, "pm_card_chargeCustomerFail");
      await vencer(p.planId, 1);
      await vencer(p.planId, 2);
      const r = await cobrarVencidas({ pasarela: pasarelaStripe });
      const suspendido = await prisma.plan.findUniqueOrThrow({ where: { id: p.planId } });
      expect(r.rechazadas).toBe(2);
      expect(suspendido.estado).toBe("SUSPENDIDO");

      await registrar(p.planId, "pm_card_visa");
      const r2 = await cobrarVencidas({ pasarela: pasarelaStripe });
      const activo = await prisma.plan.findUniqueOrThrow({ where: { id: p.planId } });
      expect(r2.cobradas).toBe(2);
      expect(activo.estado).toBe("ACTIVO");
      const bitacora = (await eventosDelPlan(p.planId)).filter((e) => /plan_(suspendido|reactivado)/.test(e.tipo));
      anotar("E3", "Suspensión por dos vencidas y reactivación", {
        rechazo: r,
        estadoTrasRechazos: suspendido.estado,
        cobro: r2,
        estadoTrasCobrar: activo.estado,
        bitacora: bitacora.map((e) => ({ tipo: e.tipo, comentario: e.comentario })),
      });
    });
  });

  // ── E4 ────────────────────────────────────────────────────────────────
  describe("E4 · Tarjeta por vencer", () => {
    let p: Awaited<ReturnType<typeof nuevoPlan>>;
    beforeAll(async () => {
      await baseLimpiaConCatalogo();
      p = await nuevoPlan();
    });

    it("al guardar la tarjeta se registra su vencimiento tal como lo da Stripe", async () => {
      await registrar(p.planId, "pm_card_visa");
      await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
      const c = await prisma.comprador.findUniqueOrThrow({ where: { id: p.compradorId } });
      const pm = await stripe.paymentMethods.retrieve(c.stripePaymentMethodId!);
      expect(c.tarjetaVenceMes).toBe(pm.card!.exp_month);
      expect(c.tarjetaVenceAnio).toBe(pm.card!.exp_year);
      anotar("E4", "Vencimiento guardado", { base: { mes: c.tarjetaVenceMes, anio: c.tarjetaVenceAnio, descripcion: c.tarjetaDescripcion }, stripe: { exp_month: pm.card!.exp_month, exp_year: pm.card!.exp_year, last4: pm.card!.last4 } });
    });

    it("payment_method.automatically_updated (el banco renueva la tarjeta) actualiza el vencimiento", async () => {
      const c = await prisma.comprador.findUniqueOrThrow({ where: { id: p.compradorId } });
      const pm = await stripe.paymentMethods.retrieve(c.stripePaymentMethodId!);
      // No se puede provocar con una tarjeta de prueba: se arma el evento con el PaymentMethod real.
      const evento = {
        id: `evt_prueba_actualizada_${Date.now()}`,
        object: "event",
        api_version: "2025-01-01",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        type: "payment_method.automatically_updated",
        data: { object: { ...pm, card: { ...pm.card, exp_year: pm.card!.exp_year + 4, exp_month: 3 } } },
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      };
      const r = await entregar(evento);
      const despues = await prisma.comprador.findUniqueOrThrow({ where: { id: p.compradorId } });
      expect(r.status).toBe(200);
      expect(despues).toMatchObject({ tarjetaVenceMes: 3, tarjetaVenceAnio: pm.card!.exp_year + 4 });
      anotar("E4", "Webhook payment_method.automatically_updated", { respuesta: r, antes: { mes: c.tarjetaVenceMes, anio: c.tarjetaVenceAnio }, despues: { mes: despues.tarjetaVenceMes, anio: despues.tarjetaVenceAnio } });
    });

    it("avisa ANTES de que falle: una tarjeta que vence antes de la próxima mensualidad aparece en las alertas", async () => {
      const hoy = new Date();
      // Vence este mes: la mensualidad 1 se cobra el mes que entra.
      await prisma.comprador.update({
        where: { id: p.compradorId },
        data: { tarjetaVenceMes: hoy.getMonth() + 1, tarjetaVenceAnio: hoy.getFullYear() },
      });
      const { alertas } = await resumenCobranza(hoy);
      const eventos = await eventosDelPlan(p.planId);
      const aviso =
        alertas.find((a) => a.planId === p.planId && /tarjeta|vence/i.test(a.texto)) ??
        eventos.find((e) => /tarjeta.*venc|por_vencer/i.test(`${e.tipo} ${e.comentario}`));
      anotar("E4", "Aviso de tarjeta por vencer", {
        tarjetaVence: `${hoy.getMonth() + 1}/${hoy.getFullYear()}`,
        alertasDelPlan: alertas.filter((a) => a.planId === p.planId),
        avisoEncontrado: aviso ?? null,
      });
      expect(aviso, "No hay ninguna alerta ni evento que avise que la tarjeta vence antes del siguiente cobro").toBeTruthy();
    });
  });

  // ── E5 ────────────────────────────────────────────────────────────────
  describe("E5 · Abono extraordinario", () => {
    let p: Awaited<ReturnType<typeof nuevoPlan>>;
    beforeAll(async () => {
      await baseLimpiaConCatalogo();
      p = await nuevoPlan();
      await registrar(p.planId, "pm_card_visa");
      await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
    });

    it("cobra el adelanto en Stripe y VERSIONA el plan: paga completas las siguientes, el sobrante a la última", async () => {
      const antes = await prisma.plan.findUniqueOrThrow({ where: { id: p.planId }, include: { exhibiciones: { orderBy: { numero: "asc" } } } });
      const mensualidad = Number(antes.exhibiciones[1].monto);
      const monto = (Math.round(mensualidad * 2.5 * 100) / 100).toFixed(2);

      const r = await ejecutarAdelanto({ planId: p.planId, monto }, { pasarela: pasarelaStripe });
      expect(r.estado).toBe("exitoso");
      if (r.estado !== "exitoso") return;
      const pi = await stripe.paymentIntents.retrieve(r.referencia);
      const despues = await prisma.plan.findUniqueOrThrow({
        where: { id: p.planId },
        include: { exhibiciones: { orderBy: [{ numero: "asc" }, { version: "asc" }] }, versiones: { orderBy: { version: "asc" } } },
      });
      expect(pi.status).toBe("succeeded");
      expect(pi.amount).toBe(Math.round(Number(monto) * 100));
      expect(r.version).toBe(2);
      expect(despues.versiones.map((v) => v.version)).toEqual([1, 2]);
      // R7: lo vivo + lo pagado sigue sumando el precio congelado.
      const vigentes = despues.exhibiciones.filter((e) => e.estado !== "REEMPLAZADA" && e.estado !== "CANCELADA");
      const suma = vigentes.reduce((a, e) => a + Math.round(Number(e.monto) * 100), 0);
      expect(suma).toBe(Math.round(Number(despues.montoCongelado) * 100));
      expect(despues.exhibiciones.filter((e) => e.estado === "REEMPLAZADA").length).toBeGreaterThan(0);
      // La versión 1 sigue consultable tal como era.
      expect((despues.versiones[0].calendario as unknown[]).length).toBe(13);

      anotar("E5", "PaymentIntent del adelanto", resumenPI(pi));
      anotar("E5", "Plan versionado", {
        monto,
        mensualidadOriginal: mensualidad,
        versionNueva: r.version,
        versiones: despues.versiones.map((v) => ({ version: v.version, motivo: v.motivo, saldo: v.saldo })),
        calendario: despues.exhibiciones.map((e) => ({ n: e.numero, tipo: e.tipo, v: e.version, monto: e.monto, estado: e.estado })),
        sumaR7Centavos: suma,
      });
    });

    it("si el banco rechaza el adelanto, el calendario vuelve a quedar como estaba", async () => {
      const antes = await prisma.exhibicion.findMany({ where: { planId: p.planId, estado: { in: ["PENDIENTE", "VENCIDA"] } }, orderBy: { numero: "asc" } });
      await tarjetaQueRechaza(p.compradorId, "pm_card_chargeDeclinedInsufficientFunds");
      const r = await ejecutarAdelanto({ planId: p.planId, monto: "1000.00" }, { pasarela: pasarelaStripe });
      const despues = await prisma.exhibicion.findMany({ where: { planId: p.planId, estado: { in: ["PENDIENTE", "VENCIDA"] } }, orderBy: { numero: "asc" } });
      expect(r.estado).toBe("rechazado");
      expect(despues.map((e) => [e.numero, Number(e.monto)])).toEqual(antes.map((e) => [e.numero, Number(e.monto)]));
      anotar("E5", "Adelanto rechazado: plan restituido", { resultado: r, vivasAntes: antes.length, vivasDespues: despues.length });
    });
  });

  // ── E6 ────────────────────────────────────────────────────────────────
  describe("E6 · Liquidación anticipada", () => {
    it("un PaymentIntent por el saldo, cancela las exhibiciones y cierra el plan; comisión sobre lo cobrado", async () => {
      await baseLimpiaConCatalogo();
      const p = await nuevoPlan();
      await registrar(p.planId, "pm_card_visa");
      await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
      await vencer(p.planId, 1);
      await cobrarVencidas({ pasarela: pasarelaStripe });
      const antes = await prisma.plan.findUniqueOrThrow({ where: { id: p.planId } });

      const r = await ejecutarLiquidacion({ planId: p.planId }, { pasarela: pasarelaStripe });
      expect(r.estado).toBe("exitoso");
      if (r.estado !== "exitoso") return;
      const pi = await stripe.paymentIntents.retrieve(r.referencia);
      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: p.planId }, include: { exhibiciones: true, pagos: true } });
      const pagoLiq = plan.pagos.find((x) => x.referenciaStripe === pi.id)!;
      expect(pi.status).toBe("succeeded");
      expect(pi.amount).toBe(Math.round(Number(antes.saldo) * 100)); // sin descuento
      expect(plan.estado).toBe("LIQUIDADO");
      expect(Number(plan.saldo)).toBe(0);
      expect(plan.exhibiciones.filter((e) => e.estado === "PENDIENTE" || e.estado === "VENCIDA")).toHaveLength(0);
      expect(Number(pagoLiq.montoComision)).toBeCloseTo(Number(pagoLiq.monto) * Number(pagoLiq.porcentajeComision), 2);
      // Ya no hay nada que cobrar.
      const barrido = await cobrarVencidas({ pasarela: pasarelaStripe, ahora: new Date(Date.now() + 400 * DIA) });
      expect(barrido.revisadas).toBe(0);
      anotar("E6", "PaymentIntent de la liquidación", resumenPI(pi));
      anotar("E6", "Plan cerrado", {
        saldoAntes: antes.saldo,
        estado: plan.estado,
        saldo: plan.saldo,
        pago: { monto: pagoLiq.monto, porcentajeComision: pagoLiq.porcentajeComision, montoComision: pagoLiq.montoComision },
        exhibiciones: plan.exhibiciones.sort((a, b) => a.numero - b.numero || a.version - b.version).map((e) => ({ n: e.numero, tipo: e.tipo, v: e.version, monto: e.monto, estado: e.estado })),
        barridoUnAnoDespues: barrido,
      });
    });
  });

  // ── E7 ────────────────────────────────────────────────────────────────
  describe("E7 · Pago total con MSI", () => {
    it("sondeo: el sistema no pide MSI en Stripe; Stripe sí permite activarlos en la cuenta", async () => {
      await baseLimpiaConCatalogo();
      const p = await nuevoPlan();
      await registrar(p.planId, "pm_card_visa");
      const r = await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
      if (r.estado !== "exitoso") throw new Error("no se cobró el anticipo");
      const pi = await stripe.paymentIntents.retrieve(r.referencia);
      const sistema = pi.payment_method_options?.card?.installments ?? null;

      const msi = await stripe.paymentIntents.create({
        amount: 10_000_00,
        currency: "mxn",
        payment_method: "pm_card_mx",
        payment_method_types: ["card"],
        payment_method_options: { card: { installments: { enabled: true } } },
      });
      anotar("E7", "Sondeo de MSI", {
        implementadoEnElSistema: false,
        installmentsQueMandaElSistema: sistema,
        stripe: { paymentIntent: msi.id, installments: msi.payment_method_options?.card?.installments },
        nota: `No hay código de MSI (lib/pasarela/stripe.ts no manda installments). Con installments.enabled, Stripe ofrece para la tarjeta de prueba mexicana: ${(msi.payment_method_options?.card?.installments?.available_plans ?? []).map((p) => `${p.count} meses`).join(", ") || "ningún plan"}.`,
      });
      await stripe.paymentIntents.cancel(msi.id);
      expect(sistema?.enabled ?? false).toBe(false);
    });
  });

  // ── E8 ────────────────────────────────────────────────────────────────
  describe("E8 · Transferencia o efectivo", () => {
    it("sondeo: SPEI y OXXO existen en Stripe; el sistema sólo cobra con tarjeta", async () => {
      const comprador = await prisma.comprador.findFirstOrThrow({ where: { stripeCustomerId: { not: null } } });
      const spei = await stripe.paymentIntents.create({
        amount: 50_000_00,
        currency: "mxn",
        customer: comprador.stripeCustomerId!,
        payment_method_types: ["customer_balance"],
        payment_method_data: { type: "customer_balance" },
        payment_method_options: { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "mx_bank_transfer" } } },
        confirm: true,
      });
      const oxxo = await stripe.paymentIntents.create({
        amount: 5_000_00,
        currency: "mxn",
        payment_method_types: ["oxxo"],
        payment_method_data: { type: "oxxo", billing_details: { name: "Comprador Prueba", email: "escenarios@example.com" } },
        confirm: true,
      });
      anotar("E8", "Sondeo de SPEI y OXXO", {
        implementadoEnElSistema: false,
        spei: { id: spei.id, status: spei.status, next_action: spei.next_action?.type, clabe: (spei.next_action?.display_bank_transfer_instructions?.financial_addresses?.[0] as { spei?: { clabe?: string } } | undefined)?.spei?.clabe ?? null },
        oxxo: { id: oxxo.id, status: oxxo.status, next_action: oxxo.next_action?.type },
        nota: "El sistema sólo usa payment_method_types: ['card'] (docs/integracion-stripe.md, «Fuera de alcance»). No hay registro manual de pagos fuera de Stripe.",
      });
      expect(spei.status).toBe("requires_action");
      expect(oxxo.status).toBe("requires_action");
      await stripe.paymentIntents.cancel(spei.id);
      // El voucher de OXXO no se puede cancelar: Stripe lo deja expirar solo (3 días).
    });
  });

  // ── E9 ────────────────────────────────────────────────────────────────
  describe("E9 · Reembolso o cancelación", () => {
    let p: Awaited<ReturnType<typeof nuevoPlan>>;
    beforeAll(async () => {
      await baseLimpiaConCatalogo();
      p = await nuevoPlan();
      await registrar(p.planId, "pm_card_visa");
      await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
      await vencer(p.planId, 1);
      await cobrarVencidas({ pasarela: pasarelaStripe });
    });

    it("devolverComision es obligatorio y explícito", async () => {
      const pago = (await exh(p.planId, 1)).pago!;
      await expect(
        reembolsarPago({ pagoId: pago.id, devolverComision: undefined as unknown as boolean, motivo: "x" }, { pasarela: pasarelaStripe })
      ).rejects.toThrow(/comisión/);
      anotar("E9", "Sin decir si se devuelve la comisión", { resultado: "ReglaError: hay que decir si se devuelve la comisión" });
    });

    it("reembolso parcial sin devolver comisión y luego el resto devolviéndola: dos registros nuevos, el Pago no se toca (R3)", async () => {
      const pago = (await exh(p.planId, 1)).pago!;
      const total = Math.round(Number(pago.monto) * 100);
      const parcial = Math.round(total / 4);
      const r1 = await reembolsarPago({ pagoId: pago.id, devolverComision: false, motivo: "Ajuste de partida", montoCentavos: parcial }, { pasarela: pasarelaStripe });
      const r2 = await reembolsarPago({ pagoId: pago.id, devolverComision: true, motivo: "Cancelación del plan" }, { pasarela: pasarelaStripe });
      const re1 = await stripe.refunds.retrieve(r1.referenciaReembolso);
      const re2 = await stripe.refunds.retrieve(r2.referenciaReembolso);
      const registros = await prisma.reembolso.findMany({ where: { pagoId: pago.id }, orderBy: { createdAt: "asc" } });
      const pagoDespues = await prisma.pago.findUniqueOrThrow({ where: { id: pago.id } });

      expect(re1).toMatchObject({ status: "succeeded", amount: parcial });
      expect(re1.metadata?.devolverComision).toBe("false");
      expect(re2).toMatchObject({ status: "succeeded", amount: total - parcial });
      expect(re2.metadata?.devolverComision).toBe("true");
      expect(registros.map((x) => x.origen)).toEqual(["BACK_OFFICE", "BACK_OFFICE"]);
      expect(Number(pagoDespues.monto)).toBe(Number(pago.monto));
      await expect(
        reembolsarPago({ pagoId: pago.id, devolverComision: true, motivo: "de más", montoCentavos: 100 }, { pasarela: pasarelaStripe })
      ).rejects.toThrow(/quedan/);

      // Y el webhook charge.refunded que Stripe mandó no duplica nada.
      const charge = (await stripe.charges.list({ payment_intent: pago.referenciaStripe! })).data[0];
      const evento = await eventoDe("charge.refunded", charge.id);
      const entrega = await entregar(evento);
      expect(entrega.status).toBe(200);
      expect(await prisma.reembolso.count({ where: { pagoId: pago.id } })).toBe(2);

      anotar("E9", "Reembolsos en Stripe", [
        { id: re1.id, amount: re1.amount, status: re1.status, metadata: re1.metadata },
        { id: re2.id, amount: re2.amount, status: re2.status, metadata: re2.metadata },
      ]);
      anotar("E9", "Registros en la base", {
        pagoOriginal: { monto: pagoDespues.monto, sinCambios: true },
        reembolsos: registros.map((x) => ({ monto: x.monto, origen: x.origen, devolvioComision: x.devolvioComision, referencia: x.referenciaStripe, motivo: x.motivo })),
        webhookChargeRefunded: entrega,
      });
    });

    it("un reembolso hecho en el Dashboard de Stripe llega por charge.refunded y se registra", async () => {
      const anticipo = (await exh(p.planId, 0)).pago!;
      const refund = await stripe.refunds.create({ payment_intent: anticipo.referenciaStripe!, amount: 50_000 });
      const charge = (await stripe.charges.list({ payment_intent: anticipo.referenciaStripe! })).data[0];
      const evento = await eventoDe("charge.refunded", charge.id);
      const entrega = await entregar(evento);
      const registro = await prisma.reembolso.findUniqueOrThrow({ where: { referenciaStripe: refund.id } });
      expect(entrega.status).toBe(200);
      expect(registro).toMatchObject({ origen: "DASHBOARD_MORETTI", devolvioComision: null });
      expect(Number(registro.monto)).toBe(500);
      anotar("E9", "Reembolso desde el Dashboard (fuera del sistema)", { refund: { id: refund.id, amount: refund.amount }, evento: evento.id, entrega, registro: { origen: registro.origen, monto: registro.monto, usuario: registro.usuario } });
    });
  });

  // ── E10 ───────────────────────────────────────────────────────────────
  describe("E10 · Contracargo", () => {
    async function planDisputado() {
      const p = await nuevoPlan();
      await registrar(p.planId, "pm_card_createDispute"); // 4000 0000 0000 0259
      const r = await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
      if (r.estado !== "exitoso") throw new Error(`anticipo ${r.estado}`);
      const disputa = await esperar("la disputa del anticipo", async () => (await stripe.disputes.list({ payment_intent: r.referencia })).data[0]);
      return { ...p, pi: r.referencia, disputa };
    }

    it("charge.dispute.created: registra la disputa, suspende el plan y el barrido no le cobra", async () => {
      await baseLimpiaConCatalogo();
      const d = await planDisputado();
      const evento = await eventoDe("charge.dispute.created", d.disputa.id);
      const entrega = await entregar(evento);
      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: d.planId }, include: { disputas: true } });
      expect(entrega.status).toBe(200);
      expect(plan.estado).toBe("SUSPENDIDO");
      expect(plan.disputas[0]).toMatchObject({ stripeDisputeId: d.disputa.id, estado: "ABIERTA" });
      await vencer(d.planId, 1);
      const barrido = await cobrarVencidas({ pasarela: pasarelaStripe });
      expect(barrido.revisadas).toBe(0);
      const alerta = (await eventosDelPlan(d.planId)).find((e) => e.tipo === "disputa_abierta");
      expect(alerta?.comentario).toMatch(/ALERTA/);
      anotar("E10", "Disputa abierta", {
        disputa: { id: d.disputa.id, amount: d.disputa.amount, reason: d.disputa.reason, status: d.disputa.status, payment_intent: d.pi },
        entrega,
        plan: { estado: plan.estado, disputa: { estado: plan.disputas[0].estado, monto: plan.disputas[0].monto } },
        barridoConMensualidadVencida: barrido,
        alerta: alerta?.comentario,
      });

      // Moretti manda evidencia ganadora → charge.dispute.closed (won) → se reactiva.
      await stripe.disputes.update(d.disputa.id, { evidence: { uncategorized_text: "winning_evidence" }, submit: true });
      const cerrada = await esperar("cierre de la disputa (won)", async () => {
        const x = await stripe.disputes.retrieve(d.disputa.id);
        return x.status === "won" ? x : null;
      }, 150_000);
      const eventoCierre = await eventoDe("charge.dispute.closed", d.disputa.id);
      const entregaCierre = await entregar(eventoCierre);
      const planDespues = await prisma.plan.findUniqueOrThrow({ where: { id: d.planId }, include: { disputas: true } });
      expect(entregaCierre.status).toBe(200);
      expect(planDespues.disputas[0].estado).toBe("GANADA");
      expect(planDespues.estado).toBe("ACTIVO");
      anotar("E10", "Disputa ganada", { disputa: { id: cerrada.id, status: cerrada.status }, entrega: entregaCierre, plan: { estado: planDespues.estado, disputa: planDespues.disputas[0].estado } });
    }, 300_000);

    it("disputa perdida: además del cierre queda un Reembolso DISPUTA_PERDIDA", async () => {
      await baseLimpiaConCatalogo();
      const d = await planDisputado();
      await entregar(await eventoDe("charge.dispute.created", d.disputa.id));
      await stripe.disputes.update(d.disputa.id, { evidence: { uncategorized_text: "losing_evidence" }, submit: true });
      const cerrada = await esperar("cierre de la disputa (lost)", async () => {
        const x = await stripe.disputes.retrieve(d.disputa.id);
        return x.status === "lost" ? x : null;
      }, 150_000);
      const entrega = await entregar(await eventoDe("charge.dispute.closed", d.disputa.id));
      const plan = await prisma.plan.findUniqueOrThrow({ where: { id: d.planId }, include: { disputas: true, reembolsos: true } });
      expect(entrega.status).toBe(200);
      expect(plan.disputas[0].estado).toBe("PERDIDA");
      expect(plan.reembolsos.map((x) => x.origen)).toContain("DISPUTA_PERDIDA");
      const bt = (await stripe.balanceTransactions.list({ source: d.disputa.id } as never).catch(() => null)) as Stripe.ApiList<Stripe.BalanceTransaction> | null;
      anotar("E10", "Disputa perdida", {
        disputa: { id: cerrada.id, status: cerrada.status, amount: cerrada.amount, balance_transactions: cerrada.balance_transactions.map((b) => ({ amount: b.amount, fee: b.fee, net: b.net, description: b.description })) },
        entrega,
        plan: { estado: plan.estado, disputa: plan.disputas[0].estado, reembolsos: plan.reembolsos.map((x) => ({ origen: x.origen, monto: x.monto, referencia: x.referenciaStripe })) },
        movimientos: bt?.data?.length ?? null,
      });
    }, 300_000);
  });

  // ── E11 ───────────────────────────────────────────────────────────────
  describe("E11 · % distinto por proyecto", () => {
    let roble: Awaited<ReturnType<typeof nuevoPlan>>;
    let lucia: Awaited<ReturnType<typeof nuevoPlan>>;

    it("cada proyecto cobra con su %; cambiarlo afecta los cobros siguientes y no el histórico", async () => {
      await baseLimpiaConCatalogo();
      roble = await nuevoPlan({ clave: "DEPA 2R (tipo 717)" });
      lucia = await nuevoPlan({ clave: "DEPA A", nombre: "Comprador Santa Lucía" });
      expect(roble.proyectoId).not.toBe(lucia.proyectoId);
      await prisma.proyecto.update({ where: { id: roble.proyectoId }, data: { porcentajeComision: 0.15 } });
      await prisma.proyecto.update({ where: { id: lucia.proyectoId }, data: { porcentajeComision: 0.1 } });

      const filas = [];
      for (const p of [roble, lucia]) {
        await registrar(p.planId, "pm_card_bypassPending");
        const r = await cobrarAnticipo(p.planId, { pasarela: pasarelaStripe });
        if (r.estado !== "exitoso") throw new Error("anticipo no cobrado");
        const pi = await stripe.paymentIntents.retrieve(r.referencia);
        const pago = (await exh(p.planId, 0)).pago!;
        expect(Number(pi.metadata.comisionCentavos)).toBe(Math.round(pi.amount * Number(pago.porcentajeComision)));
        filas.push({ proyecto: p.proyectoId, porcentaje: pago.porcentajeComision, monto: pago.monto, comision: pago.montoComision, pi: pi.id, metadata: pi.metadata.comisionCentavos });
      }
      expect(Number((await exh(roble.planId, 0)).pago!.porcentajeComision)).toBe(0.15);
      expect(Number((await exh(lucia.planId, 0)).pago!.porcentajeComision)).toBe(0.1);

      // Cambia el % de Barrio Roble: la siguiente mensualidad usa el nuevo, el anticipo no cambia.
      await prisma.proyecto.update({ where: { id: roble.proyectoId }, data: { porcentajeComision: 0.12 } });
      await vencer(roble.planId, 1);
      await cobrarVencidas({ pasarela: pasarelaStripe });
      const m1 = (await exh(roble.planId, 1)).pago!;
      const anticipoRoble = (await exh(roble.planId, 0)).pago!;
      expect(Number(m1.porcentajeComision)).toBe(0.12);
      expect(Number(anticipoRoble.porcentajeComision)).toBe(0.15);

      anotar("E11", "Comisión por proyecto", filas);
      anotar("E11", "Cambio de % a mitad del plan", { anticipo: { porcentaje: anticipoRoble.porcentajeComision, comision: anticipoRoble.montoComision }, mensualidad1: { porcentaje: m1.porcentajeComision, comision: m1.montoComision } });
    }, 180_000);

    it("D-34: Ana Cris autoriza y a Moretti se le transfiere el neto (cobrado − comisión)", async () => {
      const retenido = await prisma.pago.findMany({ where: { plan: { comprador: { unidad: { proyectoId: lucia.proyectoId } } } } });
      let t;
      try {
        t = await autorizarTransferencia({ proyectoId: lucia.proyectoId, autorizadaPor: "Prueba escenarios" }, { pasarela: pasarelaStripe });
      } catch (e) {
        const c = await stripe.accounts.retrieve(cuenta);
        anotar("E11", "Transferencia a Moretti: FALLÓ", {
          error: (e as Error).message,
          cuentaConectada: { id: c.id, country: c.country, capabilities: c.capabilities, charges_enabled: c.charges_enabled, payouts_enabled: c.payouts_enabled },
          pagosRetenidos: retenido.map((x) => ({ monto: x.monto, comision: x.montoComision, transferenciaId: x.transferenciaId })),
        });
        throw e;
      }
      const transfer = await stripe.transfers.retrieve(t.referencia);
      expect(transfer.destination).toBe(cuenta);
      expect(transfer.amount).toBe(Math.round(Number(t.neto) * 100));
      const bruto = retenido.reduce((a, x) => a + Number(x.monto), 0);
      expect(Number(t.neto)).toBeCloseTo(bruto * 0.9, 2);

      anotar("E11", "Transferencia a Moretti (neto)", { transferencia: { id: transfer.id, amount: transfer.amount, destination: transfer.destination, transfer_group: transfer.transfer_group }, bruto, neto: t.neto });
    }, 180_000);
  });
});
