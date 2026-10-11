import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { aplicarCobroConfirmado, cobrarAnticipo, cobrarExhibicion, darDeAlta } from "./planes";
import { cerrarDisputa, registrarComisionCobrada, registrarDisputa, registrarReembolso, reembolsarPago } from "./movimientos";
import { cobrarVencidas } from "./barrido";
import { crearPasarelaFalsa } from "@/lib/pasarela/falsa";
import { baseLimpiaConCatalogo, eventosDelPlan, firmarContrato, paquete, unidadLibre } from "@/pruebas/utilidades";

/** Plan Confort ($176,200) con anticipo ($52,860) y la mensualidad 1 ($10,278) cobrados. */
async function planCobrado() {
  const unidad = await unidadLibre("DEPA 2R (tipo 717)");
  const { plan } = await darDeAlta({
    nombre: "Comprador de prueba",
    contacto: "81",
    unidadId: unidad.id,
    paqueteId: (await paquete("confort")).id,
  });
  await firmarContrato(unidad.id);
  const pasarela = crearPasarelaFalsa({
    decidir: (s) => ({ estado: "exitoso", referenciaPasarela: `pi_${s.numeroExhibicion}_${plan.id}` }),
  });
  await cobrarAnticipo(plan.id, { pasarela });
  const exhibiciones = await prisma.exhibicion.findMany({ where: { planId: plan.id }, orderBy: { numero: "asc" } });
  await cobrarExhibicion(exhibiciones[1].id, { pasarela });
  const pagos = await prisma.pago.findMany({ where: { planId: plan.id }, include: { exhibicion: true } });
  const anticipo = pagos.find((p) => p.exhibicion.numero === 0)!;
  const mensualidad = pagos.find((p) => p.exhibicion.numero === 1)!;
  return { plan, exhibiciones, anticipo, mensualidad };
}

const planDe = (id: string) => prisma.plan.findUniqueOrThrow({ where: { id } });

beforeEach(baseLimpiaConCatalogo);

describe("reembolsos (R3: movimiento nuevo, el pago no se toca)", () => {
  it("desde el back office: devolverComision es explícito y el pago original queda igual", async () => {
    const { plan, mensualidad } = await planCobrado();
    const pasarela = crearPasarelaFalsa();

    const hecho = await reembolsarPago(
      { pagoId: mensualidad.id, montoCentavos: 500000, devolverComision: false, motivo: "cancelación parcial", usuario: "ana" },
      { pasarela }
    );

    expect(pasarela.reembolsos[0]).toMatchObject({
      llave: `pago_${mensualidad.id}:reembolso_1`,
      solicitud: { referenciaPasarela: mensualidad.referenciaStripe, montoCentavos: 500000, devolverComision: false },
    });
    const reembolso = await prisma.reembolso.findUniqueOrThrow({ where: { referenciaStripe: hecho.referenciaReembolso } });
    expect(reembolso).toMatchObject({ origen: "BACK_OFFICE", devolvioComision: false, usuario: "ana" });
    expect(Number(reembolso.monto)).toBe(5000);
    const pago = await prisma.pago.findUniqueOrThrow({ where: { id: mensualidad.id } });
    expect(pago).toMatchObject({ estado: "CONFIRMADO" });
    expect(Number(pago.monto)).toBe(10278);
    const evento = (await eventosDelPlan(plan.id)).find((e) => e.tipo === "reembolso_registrado");
    expect(evento?.comentario).toMatch(/comisión del canal no se devolvió.*R3/);
  });

  it("sin decir si se devuelve la comisión, o por más de lo que queda, no se reembolsa", async () => {
    const { mensualidad } = await planCobrado();
    const pasarela = crearPasarelaFalsa();

    await expect(
      reembolsarPago({ pagoId: mensualidad.id, motivo: "x" } as never, { pasarela })
    ).rejects.toThrow(/comisión del canal/);
    await reembolsarPago({ pagoId: mensualidad.id, montoCentavos: 1000000, devolverComision: true, motivo: "x" }, { pasarela });
    await expect(
      reembolsarPago({ pagoId: mensualidad.id, montoCentavos: 50000, devolverComision: true, motivo: "x" }, { pasarela })
    ).rejects.toThrow(/quedan \$278/);
    expect(pasarela.reembolsos).toHaveLength(1);
  });

  it("Moretti reembolsa desde su Dashboard: charge.refunded lo registra una sola vez", async () => {
    const { plan, anticipo } = await planCobrado();
    const aviso = {
      referenciaPasarela: anticipo.referenciaStripe!,
      referenciaReembolso: "re_dashboard_1",
      montoCentavos: 5286000,
      origen: "DASHBOARD_MORETTI" as const,
    };

    expect(await registrarReembolso(aviso)).toBe("registrado");
    expect(await registrarReembolso(aviso)).toBe("ya_registrado");
    expect(await prisma.reembolso.count({ where: { planId: plan.id } })).toBe(1);
    expect(await registrarReembolso({ ...aviso, referenciaReembolso: "re_otro", referenciaPasarela: "pi_ajeno" })).toBe(
      "sin_pago"
    );
  });
});

describe("disputas", () => {
  it("una disputa abierta suspende el plan y el barrido no le cobra; al ganarla se reactiva", async () => {
    const { plan, exhibiciones, mensualidad } = await planCobrado();
    await prisma.exhibicion.update({ where: { id: exhibiciones[2].id }, data: { fechaProgramada: new Date(Date.now() - 86_400_000) } });
    const datos = {
      referenciaDisputa: "dp_1",
      referenciaPasarela: mensualidad.referenciaStripe!,
      montoCentavos: 1027800,
      motivo: "fraudulent",
    };

    expect(await registrarDisputa(datos)).toBe("registrado");
    expect(await registrarDisputa(datos)).toBe("ya_registrado");
    expect((await planDe(plan.id)).estado).toBe("SUSPENDIDO");
    expect((await cobrarVencidas({ pasarela: crearPasarelaFalsa() })).revisadas).toBe(0);

    expect(await cerrarDisputa({ ...datos, estadoPasarela: "won" })).toBe("registrado");
    expect((await planDe(plan.id)).estado).toBe("ACTIVO");
    expect(await prisma.disputa.findUniqueOrThrow({ where: { stripeDisputeId: "dp_1" } })).toMatchObject({ estado: "GANADA" });
    expect(await prisma.reembolso.count({ where: { planId: plan.id } })).toBe(0);
  });

  it("una disputa perdida queda como reembolso por disputa, sin editar el pago", async () => {
    const { plan, mensualidad } = await planCobrado();
    const datos = { referenciaDisputa: "dp_2", referenciaPasarela: mensualidad.referenciaStripe!, montoCentavos: 1027800, motivo: "product_not_received" };

    // El cierre puede llegar antes que la apertura.
    expect(await cerrarDisputa({ ...datos, estadoPasarela: "lost" })).toBe("registrado");
    expect(await cerrarDisputa({ ...datos, estadoPasarela: "lost" })).toBe("ya_registrado");

    const reembolso = await prisma.reembolso.findUniqueOrThrow({ where: { referenciaStripe: "dp_2" } });
    expect(reembolso.origen).toBe("DISPUTA_PERDIDA");
    expect((await prisma.pago.findUniqueOrThrow({ where: { id: mensualidad.id } })).estado).toBe("CONFIRMADO");
    expect((await planDe(plan.id)).estado).toBe("ACTIVO");
  });
});

describe("la pasarela es la fuente de la verdad", () => {
  it("application_fee.created guarda el id una vez y alerta si la comisión no coincide", async () => {
    const { plan, anticipo, mensualidad } = await planCobrado();

    expect(
      await registrarComisionCobrada({ referenciaComision: "fee_1", referenciaPasarela: mensualidad.referenciaStripe!, montoCentavos: 154170 })
    ).toBe("registrado");
    expect(
      await registrarComisionCobrada({ referenciaComision: "fee_1", referenciaPasarela: mensualidad.referenciaStripe!, montoCentavos: 154170 })
    ).toBe("ya_registrado");
    expect((await prisma.pago.findUniqueOrThrow({ where: { id: mensualidad.id } })).stripeApplicationFeeId).toBe("fee_1");
    expect((await eventosDelPlan(plan.id)).some((e) => e.tipo === "discrepancia_stripe")).toBe(false);

    // La del anticipo es de $7,929.00; Stripe dice otra cosa.
    await registrarComisionCobrada({ referenciaComision: "fee_2", referenciaPasarela: anticipo.referenciaStripe!, montoCentavos: 1 });
    expect((await eventosDelPlan(plan.id)).some((e) => e.tipo === "discrepancia_stripe")).toBe(true);
  });

  it("si la comisión todavía no tiene pago, truena para que Stripe la vuelva a mandar", async () => {
    await expect(
      registrarComisionCobrada({ referenciaComision: "fee_x", referenciaPasarela: "pi_sin_pago", montoCentavos: 1 })
    ).rejects.toThrow(/Stripe reintentará/);
  });

  it("un cobro confirmado con otro monto o comisión registra lo de Stripe y deja alerta", async () => {
    const { plan, exhibiciones } = await planCobrado();
    const m2 = exhibiciones[2];

    expect(
      await aplicarCobroConfirmado({ exhibicionId: m2.id, referenciaPasarela: "pi_m2", montoCentavos: 1000000, comisionCentavos: 100000 })
    ).toBe("aplicado");

    const pago = await prisma.pago.findUniqueOrThrow({ where: { exhibicionId: m2.id } });
    expect(Number(pago.monto)).toBe(10000);
    expect(Number(pago.montoComision)).toBe(1000);
    expect(Number(pago.porcentajeComision)).toBe(0.1);
    expect(pago.stripePaymentIntentId).toBe("pi_m2");
    const alerta = (await eventosDelPlan(plan.id)).find((e) => e.tipo === "discrepancia_stripe");
    expect(alerta?.comentario).toMatch(/Stripe cobró \$10,000\.00.*comisión cobrada en Stripe fue \$1,000\.00/);
  });

  it("un segundo cargo para una exhibición ya pagada queda como cargo excedente, una vez", async () => {
    const { plan, mensualidad } = await planCobrado();

    expect(
      await aplicarCobroConfirmado({ exhibicionId: mensualidad.exhibicionId, referenciaPasarela: "pi_doble", montoCentavos: 1027800 })
    ).toBe("otro_cargo");
    expect(
      await aplicarCobroConfirmado({ exhibicionId: mensualidad.exhibicionId, referenciaPasarela: "pi_doble", montoCentavos: 1027800 })
    ).toBe("otro_cargo");

    const excedentes = await prisma.cargoExcedente.findMany({ where: { planId: plan.id } });
    expect(excedentes).toHaveLength(1);
    expect(excedentes[0]).toMatchObject({ referenciaStripe: "pi_doble", montoCentavos: 1027800 });
    expect((await eventosDelPlan(plan.id)).filter((e) => e.tipo === "posible_doble_cargo")).toHaveLength(1);
    expect(await prisma.pago.count({ where: { exhibicionId: mensualidad.exhibicionId } })).toBe(1);
  });
});
