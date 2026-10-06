import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { crearPasarelaFalsa, rechazo } from "@/lib/pasarela/falsa";
import { cargarCatalogo } from "./catalogo";
import { avanzarEstadoOperativo } from "./obra";
import { cobrarAnticipo, darDeAlta } from "./planes";
import { ejecutarUpgrade, previsualizarUpgrade } from "./upgrade";
import { versionesDelPlan } from "./versiones";
import { baseLimpiaConCatalogo, firmarContrato, paquete, unidadLibre } from "@/pruebas/utilidades";

async function planCasaLista() {
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
  const catalogo = await cargarCatalogo(unidad.prototipoId);
  const precio = (slug: string) => catalogo.prototipo.paquetes.find((p) => p.slug === slug)!.precio;
  return { unidad, plan, pasarela, diferencia: precio("confort") - precio("casa-lista"), confort: await paquete("confort") };
}

const vigentes = (planId: string) =>
  prisma.exhibicion.findMany({
    where: { planId, estado: { in: ["PENDIENTE", "VENCIDA", "PAGADA"] } },
    orderBy: [{ numero: "asc" }, { tipo: "asc" }],
  });
const suma = (xs: { monto?: unknown; precioCongelado?: unknown }[]) =>
  xs.reduce((a, x) => a + Number(x.monto ?? x.precioCongelado), 0);

beforeEach(baseLimpiaConCatalogo);

describe("T · upgrade de paquete en el motor", () => {
  it("la vista previa dice cuánto se cobra hoy y cómo quedan las mensualidades, sin cambiar nada", async () => {
    const { plan, diferencia, confort } = await planCasaLista();
    const vista = await previsualizarUpgrade(plan.id, confort.id);
    expect(vista).toMatchObject({
      paqueteActual: "Casa Lista",
      paqueteNuevo: "Confort",
      totalAntes: 147300,
      diferencia,
      totalDespues: 147300 + diferencia,
      cobroHoy: Math.round(diferencia * 0.3),
      exhibiciones: 12,
    });
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } })).version).toBe(1);
  });

  it("conserva el precio congelado, no alarga el plan y todo cuadra al peso", async () => {
    const { plan, pasarela, diferencia, confort } = await planCasaLista();
    const renglonesAntes = await prisma.renglonPlan.findMany({ where: { planId: plan.id } });
    const fechasAntes = (await vigentes(plan.id)).filter((e) => e.estado === "PENDIENTE").map((e) => e.fechaProgramada.getTime());

    const r = await ejecutarUpgrade({ planId: plan.id, paqueteId: confort.id }, { pasarela });
    expect(r).toMatchObject({ estado: "exitoso", version: 2 });

    const despues = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id }, include: { renglones: true } });
    expect(despues.paqueteId).toBe(confort.id);
    expect(Number(despues.montoCongelado)).toBe(147300 + diferencia);
    // R7: lista de partidas y calendario vigente suman el total nuevo.
    expect(suma(despues.renglones)).toBe(147300 + diferencia);
    expect(suma(await vigentes(plan.id))).toBe(147300 + diferencia);
    // R2: los renglones que ya estaban no cambian.
    for (const antes of renglonesAntes) {
      expect(despues.renglones.find((x) => x.id === antes.id)).toEqual(antes);
    }
    // El plan no se alarga: las mismas 12 fechas.
    const pendientes = (await vigentes(plan.id)).filter((e) => e.estado === "PENDIENTE");
    expect(pendientes.map((e) => e.fechaProgramada.getTime())).toEqual(fechasAntes);
    expect((await versionesDelPlan(plan.id))[0].motivo).toMatch(/^Upgrade de Casa Lista a Confort/);
  });

  it("R6: con el levantamiento hecho no procede, y el error dice por qué", async () => {
    const { unidad, plan, confort } = await planCasaLista();
    await avanzarEstadoOperativo({ unidadId: unidad.id, hacia: "LEVANTAMIENTO_HECHO" });
    await expect(previsualizarUpgrade(plan.id, confort.id)).rejects.toThrow(
      /Ya no se puede cambiar el paquete: el levantamiento en obra ya se hizo .*\(R6\)/
    );
  });

  it("bajar de paquete no es upgrade", async () => {
    const unidad = await unidadLibre("DEPA 2R (tipo 717)");
    const { plan } = await darDeAlta({ nombre: "X", contacto: "81", unidadId: unidad.id, paqueteId: (await paquete("confort")).id });
    await firmarContrato(unidad.id);
    await cobrarAnticipo(plan.id, { pasarela: crearPasarelaFalsa() });
    await expect(previsualizarUpgrade(plan.id, (await paquete("casa-lista")).id)).rejects.toThrow(
      "Casa Lista no es mayor que Confort: el upgrade sólo sube de paquete."
    );
  });

  it("si el banco rechaza la diferencia, el paquete, la lista y el calendario vuelven a como estaban", async () => {
    const { plan, confort } = await planCasaLista();
    const antes = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id }, include: { renglones: true } });
    const calAntes = (await vigentes(plan.id)).map((e) => [e.numero, Number(e.monto)]);

    const r = await ejecutarUpgrade(
      { planId: plan.id, paqueteId: confort.id },
      { pasarela: crearPasarelaFalsa({ decidir: () => rechazo("card_declined") }) }
    );

    expect(r).toMatchObject({ estado: "rechazado", version: 3 });
    const despues = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id }, include: { renglones: true } });
    expect([despues.paqueteId, Number(despues.montoCongelado), Number(despues.saldo)]).toEqual([
      antes.paqueteId,
      Number(antes.montoCongelado),
      Number(antes.saldo),
    ]);
    expect(despues.renglones.map((x) => x.id).sort()).toEqual(antes.renglones.map((x) => x.id).sort());
    expect((await vigentes(plan.id)).map((e) => [e.numero, Number(e.monto)])).toEqual(calAntes);
  });
});
