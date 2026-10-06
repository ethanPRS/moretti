import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { crearPasarelaFalsa } from "@/lib/pasarela/falsa";
import { elegirAcabado } from "./acabados";
import { avanzarEstadoOperativo, avanzarInstalacion, registrarActaEntrega } from "./obra";
import {
  cambiarEstadoFinanciero,
  cobrarAnticipo,
  cobrarExhibicion,
  confirmarCobroStripe,
  darDeAlta,
  registrarContrato,
} from "./planes";
import { baseLimpiaConCatalogo, firmarContrato, paquete, unidadLibre } from "@/pruebas/utilidades";

async function alta() {
  const unidad = await unidadLibre("DEPA 2R (tipo 717)");
  const { plan } = await darDeAlta({
    nombre: "Comprador de prueba",
    contacto: "81",
    unidadId: unidad.id,
    paqueteId: (await paquete("casa-lista")).id,
  });
  return { unidad, plan };
}

async function apartada() {
  const { unidad, plan } = await alta();
  await firmarContrato(unidad.id);
  const pasarela = crearPasarelaFalsa();
  await cobrarAnticipo(plan.id, { pasarela });
  return { unidad, plan, pasarela };
}

async function liquidar(planId: string, pasarela: ReturnType<typeof crearPasarelaFalsa>) {
  const pendientes = await prisma.exhibicion.findMany({
    where: { planId, estado: "PENDIENTE" },
    orderBy: { numero: "asc" },
  });
  for (const e of pendientes) await cobrarExhibicion(e.id, { pasarela });
}

async function elegirTodos(planId: string) {
  const renglones = await prisma.renglonPlan.findMany({ where: { planId }, include: { partida: true } });
  for (const r of renglones) {
    const opciones = r.partida.acabados as [string, string][] | null;
    if (opciones?.length) await elegirAcabado({ renglonId: r.id, acabado: opciones[0][0] });
  }
}

const unidadDe = (id: string) => prisma.unidad.findUniqueOrThrow({ where: { id } });

beforeEach(baseLimpiaConCatalogo);

describe("Q · APARTADO requiere contrato firmado Y anticipo cobrado", () => {
  it("el contrato solo no aparta la unidad", async () => {
    const { unidad } = await alta();
    await registrarContrato({
      unidadId: unidad.id,
      archivoNombre: "c.pdf",
      quienFirmo: "Comprador",
      fechaFirma: new Date(),
    });
    expect((await unidadDe(unidad.id)).estadoFinanciero).toBe("COTIZADO");
  });

  it("el anticipo solo tampoco: si Stripe confirma un anticipo sin contrato, el pago queda pero la unidad no se aparta y la alerta dice qué falta", async () => {
    const { unidad, plan } = await alta();
    await prisma.proyecto.update({ where: { id: unidad.proyectoId }, data: { stripeConnectedAccountId: "acct_prueba" } });
    const anticipo = await prisma.exhibicion.findFirstOrThrow({ where: { planId: plan.id, numero: 0 } });
    await prisma.intentoCobro.create({
      data: {
        exhibicionId: anticipo.id,
        planId: plan.id,
        idempotencyKey: "prueba-sin-contrato",
        stripePaymentIntentId: "pi_sin_contrato",
        stripeAccountId: "acct_prueba",
        monto: anticipo.monto,
        porcentajeComision: 0.1,
        montoComision: 0,
      },
    });

    await confirmarCobroStripe({ paymentIntentId: "pi_sin_contrato", stripeAccountId: "acct_prueba" });

    expect((await unidadDe(unidad.id)).estadoFinanciero).toBe("COTIZADO");
    expect(await prisma.pago.count({ where: { planId: plan.id } })).toBe(1);
    const alerta = await prisma.evento.findFirstOrThrow({
      where: { entidadId: unidad.id, tipo: "estado_financiero_inesperado" },
    });
    expect(alerta.comentario).toMatch(/falta el contrato firmado \(Apartado requiere contrato y anticipo\)/);
  });

  it("con los dos, Stripe la aparta por la máquina y deja el evento del paso", async () => {
    const { unidad, plan } = await alta();
    await firmarContrato(unidad.id);
    const anticipo = await prisma.exhibicion.findFirstOrThrow({ where: { planId: plan.id, numero: 0 } });
    await prisma.intentoCobro.create({
      data: {
        exhibicionId: anticipo.id,
        planId: plan.id,
        idempotencyKey: "prueba-con-contrato",
        stripePaymentIntentId: "pi_con_contrato",
        stripeAccountId: "acct_prueba",
        monto: anticipo.monto,
        porcentajeComision: 0.1,
        montoComision: 0,
      },
    });
    await confirmarCobroStripe({ paymentIntentId: "pi_con_contrato", stripeAccountId: "acct_prueba" });

    expect((await unidadDe(unidad.id)).estadoFinanciero).toBe("APARTADO");
    const paso = await prisma.evento.findFirstOrThrow({
      where: { entidadId: unidad.id, tipo: "estado_financiero_cambiado" },
    });
    expect(paso.comentario).toBe("Estado financiero: Cotizado → Apartado porque Stripe confirmó el anticipo.");
  });
});

describe("Q · las máquinas operativa y de instalación en el motor", () => {
  it("el levantamiento no procede sin la unidad apartada, y el error lo dice", async () => {
    const { unidad } = await alta();
    await expect(avanzarEstadoOperativo({ unidadId: unidad.id, hacia: "LEVANTAMIENTO_HECHO" })).rejects.toThrow(
      "No se puede pasar a Levantamiento hecho. Falta: que la unidad esté apartada (contrato firmado y anticipo cobrado); hoy está en Cotizado."
    );
  });

  it("ACABADOS_ELEGIDOS nombra las partidas sin acabado", async () => {
    const { unidad } = await apartada();
    await avanzarEstadoOperativo({ unidadId: unidad.id, hacia: "LEVANTAMIENTO_HECHO" });
    await expect(avanzarEstadoOperativo({ unidadId: unidad.id, hacia: "ACABADOS_ELEGIDOS" })).rejects.toThrow(
      /Falta: elegir el acabado de «Cocina integral sobre diseño», «Clósets de recámaras»/
    );
  });

  it("R6: con el levantamiento hecho ya no se cambia el acabado", async () => {
    const { unidad, plan } = await apartada();
    await avanzarEstadoOperativo({ unidadId: unidad.id, hacia: "LEVANTAMIENTO_HECHO" });
    const cocina = await prisma.renglonPlan.findFirstOrThrow({
      where: { planId: plan.id, partida: { clave: "cocina" } },
    });
    await expect(elegirAcabado({ renglonId: cocina.id, acabado: "Opción 2 · Nogal" })).rejects.toThrow(/R6/);
  });

  it("EN_PRODUCCION requiere LIQUIDADO aunque los acabados estén elegidos", async () => {
    const { unidad, plan } = await apartada();
    await elegirTodos(plan.id);
    await avanzarEstadoOperativo({ unidadId: unidad.id, hacia: "LEVANTAMIENTO_HECHO" });
    await avanzarEstadoOperativo({ unidadId: unidad.id, hacia: "ACABADOS_ELEGIDOS" });
    await expect(avanzarEstadoOperativo({ unidadId: unidad.id, hacia: "EN_PRODUCCION" })).rejects.toThrow(
      "No se puede pasar a En producción. Falta: que el plan esté Liquidado; hoy está en Apartado."
    );
  });

  it("suspendida no avanza y tampoco retrocede; al reactivarla sigue donde iba", async () => {
    const { unidad, plan, pasarela } = await apartada();
    const primera = await prisma.exhibicion.findFirstOrThrow({ where: { planId: plan.id, numero: 1 } });
    await cobrarExhibicion(primera.id, { pasarela });
    await elegirTodos(plan.id);
    await avanzarEstadoOperativo({ unidadId: unidad.id, hacia: "LEVANTAMIENTO_HECHO" });
    await cambiarEstadoFinanciero({ unidadId: unidad.id, hacia: "SUSPENDIDO", motivo: "dos vencidas" });

    await expect(avanzarEstadoOperativo({ unidadId: unidad.id, hacia: "ACABADOS_ELEGIDOS" })).rejects.toThrow(
      /Suspendido: no avanza/
    );
    expect((await unidadDe(unidad.id)).estadoOperativo).toBe("LEVANTAMIENTO_HECHO");

    await cambiarEstadoFinanciero({ unidadId: unidad.id, hacia: "AL_CORRIENTE", motivo: "se puso al día" });
    await avanzarEstadoOperativo({ unidadId: unidad.id, hacia: "ACABADOS_ELEGIDOS" });
    expect((await unidadDe(unidad.id)).estadoOperativo).toBe("ACABADOS_ELEGIDOS");
  });

  it("de punta a punta: liquidado, producido, instalado y entregado con acta; cada paso con su evento", async () => {
    const { unidad, plan, pasarela } = await apartada();
    await elegirTodos(plan.id);
    await liquidar(plan.id, pasarela);
    expect((await unidadDe(unidad.id)).estadoFinanciero).toBe("LIQUIDADO");

    for (const hacia of ["LEVANTAMIENTO_HECHO", "ACABADOS_ELEGIDOS", "EN_PRODUCCION", "PRODUCIDO", "EN_ALMACEN"] as const) {
      await avanzarEstadoOperativo({ unidadId: unidad.id, hacia });
    }
    await avanzarInstalacion({ unidadId: unidad.id, hacia: "PROGRAMADA" });
    await avanzarInstalacion({ unidadId: unidad.id, hacia: "INSTALADA" });
    await expect(avanzarInstalacion({ unidadId: unidad.id, hacia: "ENTREGADA" })).rejects.toThrow(
      "No se puede pasar a Entregada. Falta: el acta de entrega firmada en el expediente."
    );

    await registrarActaEntrega({
      unidadId: unidad.id,
      archivoNombre: "acta.pdf",
      quienFirmo: "Comprador de prueba",
      fechaFirma: new Date("2027-03-01T12:00:00"),
    });
    await avanzarInstalacion({ unidadId: unidad.id, hacia: "ENTREGADA" });

    const final = await unidadDe(unidad.id);
    expect([final.estadoOperativo, final.estadoInstalacion]).toEqual(["EN_ALMACEN", "ENTREGADA"]);
    const pasos = await prisma.evento.findMany({
      where: { entidadId: unidad.id, tipo: { in: ["estado_operativo_cambiado", "estado_instalacion_cambiado"] } },
      orderBy: { fecha: "asc" },
    });
    expect(pasos).toHaveLength(8);
  });

  it("saltarse un paso no procede y dice cuál falta", async () => {
    const { unidad } = await apartada();
    await expect(avanzarEstadoOperativo({ unidadId: unidad.id, hacia: "ACABADOS_ELEGIDOS" })).rejects.toThrow(
      /Falta: pasar antes por Levantamiento hecho/
    );
  });
});
