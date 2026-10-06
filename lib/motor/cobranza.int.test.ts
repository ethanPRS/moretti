import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { crearPasarelaFalsa, rechazo } from "@/lib/pasarela/falsa";
import { resumenCobranza } from "./cobranza";
import { cambiarEstadoFinanciero, cobrarAnticipo, cobrarExhibicion, darDeAlta } from "./planes";
import { baseLimpiaConCatalogo, firmarContrato, paquete, unidadLibre } from "@/pruebas/utilidades";

async function planActivo(nombre: string) {
  const unidad = await unidadLibre("DEPA 2R (tipo 717)");
  const { plan } = await darDeAlta({ nombre, contacto: "81", unidadId: unidad.id, paqueteId: (await paquete("casa-lista")).id });
  await firmarContrato(unidad.id);
  await cobrarAnticipo(plan.id, { pasarela: crearPasarelaFalsa() });
  return { unidad, plan };
}

beforeEach(baseLimpiaConCatalogo);

describe("V · tablero de cobranza", () => {
  it("refleja la cartera de prueba y las alertas aparecen solas", async () => {
    // Al corriente: anticipo y la 1 cobradas.
    const alDia = await planActivo("Al día");
    const e1 = await prisma.exhibicion.findFirstOrThrow({ where: { planId: alDia.plan.id, numero: 1 } });
    await cobrarExhibicion(e1.id, { pasarela: crearPasarelaFalsa() });

    // Con vencidas: su mensualidad 1 ya pasó y se rechazó.
    const atrasado = await planActivo("Atrasado");
    const v1 = await prisma.exhibicion.findFirstOrThrow({ where: { planId: atrasado.plan.id, numero: 1 } });
    await prisma.exhibicion.update({ where: { id: v1.id }, data: { fechaProgramada: new Date(Date.now() - 10 * 86_400_000) } });
    await cobrarExhibicion(v1.id, { pasarela: crearPasarelaFalsa({ decidir: () => rechazo("insufficient_funds") }) });

    // Suspendido.
    const suspendido = await planActivo("Suspendido");
    const s1 = await prisma.exhibicion.findFirstOrThrow({ where: { planId: suspendido.plan.id, numero: 1 } });
    await cobrarExhibicion(s1.id, { pasarela: crearPasarelaFalsa() });
    await cambiarEstadoFinanciero({ unidadId: suspendido.unidad.id, hacia: "SUSPENDIDO", motivo: "prueba" });

    const { resumen, alertas } = await resumenCobranza();
    const proyecto = resumen.find((r) => r.id === alDia.unidad.proyectoId)!;
    expect(proyecto).toMatchObject({ vendidos: 3, apartados: 1, alCorriente: 1, suspendidos: 1, conVencidas: 1, fallidosMes: 1 });
    // 3 anticipos + 2 mensualidades cobradas este mes.
    expect(proyecto.cobrosMes).toBe(5);

    const tipos = alertas.map((a) => `${a.tipo}:${a.comprador}`).sort();
    expect(tipos).toEqual(["fallido:Atrasado", "suspendido:Suspendido", "vencida:Atrasado"]);
    expect(alertas.find((a) => a.tipo === "vencida")!.texto).toMatch(/^1 exhibición vencida por \$8,593/);
  });
});
