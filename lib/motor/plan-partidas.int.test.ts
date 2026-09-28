import { beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { darDeAlta, cobrarAnticipo, generarPlan, ReglaError } from "./planes";
import { cargarCatalogo, cargarCatalogosPorProyecto } from "./catalogo";
import { cotizarEnCatalogo, contenidoComoCanasta, canastaInicialArmaElTuyo } from "./canasta";
import { crearPasarelaFalsa } from "@/lib/pasarela/falsa";
import { sembrarCompradorDeEjemplo } from "@/prisma/sembrar";
import { CATALOGO } from "@/prisma/catalogo";
import {
  baseLimpiaConCatalogo,
  eventosDelPlan,
  firmarContrato,
  paquete,
  unidadLibre,
} from "@/pruebas/utilidades";

const { Decimal } = Prisma;
const DEPA_2R = "DEPA 2R (tipo 717)";

async function renglonesDe(planId: string) {
  const renglones = await prisma.renglonPlan.findMany({
    where: { planId },
    include: { partida: true },
  });
  return renglones
    .sort((a, b) => a.partida.orden - b.partida.orden || a.origen.localeCompare(b.origen))
    .map((r) => ({
      clave: r.partida.clave,
      cantidad: r.cantidad,
      precioLista: Number(r.precioLista),
      precioCongelado: Number(r.precioCongelado),
      origen: r.origen,
    }));
}

async function alta(clavePrototipo: string, slug: string, canasta?: Record<string, number>) {
  const unidad = await unidadLibre(clavePrototipo);
  const { plan } = await darDeAlta({
    nombre: "Comprador de prueba",
    contacto: "81 0000 0000",
    unidadId: unidad.id,
    paqueteId: (await paquete(slug)).id,
    canasta,
  });
  return { unidad, plan };
}

const suma = (xs: { precioCongelado: number }[]) => xs.reduce((a, r) => a + r.precioCongelado, 0);

beforeEach(baseLimpiaConCatalogo);

describe("S1-02 · el plan guarda la lista de partidas", () => {
  it("cada renglón lleva partida, cantidad, precio de lista y precio congelado", async () => {
    const { plan } = await alta(DEPA_2R, "confort");

    expect(await renglonesDe(plan.id)).toEqual([
      { clave: "cocina", cantidad: 1, precioLista: 78000, precioCongelado: 77912, origen: "PAQUETE" },
      { clave: "closets", cantidad: 1, precioLista: 54600, precioCongelado: 54538, origen: "PAQUETE" },
      { clave: "carp", cantidad: 1, precioLista: 14700, precioCongelado: 14683, origen: "PAQUETE" },
      { clave: "clima", cantidad: 3, precioLista: 9700, precioCongelado: 29067, origen: "PAQUETE" },
    ]);
    expect(Number(plan.montoCongelado)).toBe(176200);
    expect(plan.modalidad).toBe("PAQUETE");
    expect(plan.precioId).not.toBeNull();
  });

  it("R7: en los 52 paquetes cerrados, renglones = monto congelado = exhibiciones, al peso", async () => {
    let casos = 0;
    for (const prototipos of Object.values(CATALOGO)) {
      for (const proto of prototipos) {
        for (const [i, slug] of ["casa-lista", "confort", "plus", "total"].entries()) {
          const { plan } = await alta(proto.clave, slug);
          const renglones = await renglonesDe(plan.id);
          const exhibiciones = await prisma.exhibicion.findMany({ where: { planId: plan.id } });

          expect(Number(plan.montoCongelado)).toBe(proto.precios[i]);
          expect(suma(renglones)).toBe(proto.precios[i]);
          expect(exhibiciones.reduce((a, e) => a.add(e.monto), new Decimal(0)).toNumber()).toBe(
            proto.precios[i]
          );
          casos++;
        }
      }
    }
    expect(casos).toBe(52);
  });

  it("el plan de ejemplo DU-001 (Confort) conserva sus $176,200", async () => {
    const plan = await sembrarCompradorDeEjemplo(crearPasarelaFalsa());
    const comprador = await prisma.comprador.findUniqueOrThrow({ where: { id: plan.compradorId } });

    expect(comprador.folio).toBe("DU-001");
    expect(Number(plan.montoCongelado)).toBe(176200);
    expect(suma(await renglonesDe(plan.id))).toBe(176200);
  });

  it("R2: cobrar el anticipo congela la lista completa, no sólo el total", async () => {
    const { unidad, plan } = await alta(DEPA_2R, "confort", { cocina: 1, closets: 1, carp: 1, clima: 3, tv: 1 });
    await firmarContrato(unidad.id);
    const antes = await renglonesDe(plan.id);

    expect((await cobrarAnticipo(plan.id, { pasarela: crearPasarelaFalsa() })).estado).toBe("exitoso");

    // Moretti sube la lista de la pantalla y el precio del paquete después del anticipo…
    const tv = await prisma.partida.findUniqueOrThrow({ where: { clave: "tv" } });
    await prisma.precioPartida.update({
      where: { prototipoId_partidaId: { prototipoId: unidad.prototipoId, partidaId: tv.id } },
      data: { monto: 99900 },
    });
    const confort = await paquete("confort");
    const ahora = new Date();
    await prisma.precio.updateMany({
      where: { prototipoId: unidad.prototipoId, paqueteId: confort.id, vigenteHasta: null },
      data: { vigenteHasta: ahora },
    });
    await prisma.precio.create({
      data: { prototipoId: unidad.prototipoId, paqueteId: confort.id, monto: 199000, vigenteDesde: ahora },
    });

    // …y el plan congelado no se mueve, renglón por renglón.
    const congelado = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(congelado.fechaCongelamiento).not.toBeNull();
    expect(Number(congelado.montoCongelado)).toBe(176200 + 46500);
    expect(await renglonesDe(plan.id)).toEqual(antes);

    // Una venta nueva del mismo prototipo sí toma los precios nuevos.
    const { plan: nuevo } = await alta(DEPA_2R, "confort", { cocina: 1, closets: 1, carp: 1, clima: 3, tv: 1 });
    expect(Number(nuevo.montoCongelado)).toBe(199000 + 99900);

    const eventos = await eventosDelPlan(plan.id);
    expect(eventos.find((e) => e.tipo === "anticipo_cobrado")?.comentario).toMatch(
      /Precio congelado en \$222,700 con sus 5 partidas: la lista ya no cambia \(R2\)/
    );
  });

  it("no se cobra el anticipo de un plan cuya lista no cuadra con su total (R7)", async () => {
    const { unidad, plan } = await alta(DEPA_2R, "confort");
    await firmarContrato(unidad.id);
    const renglon = await prisma.renglonPlan.findFirstOrThrow({ where: { planId: plan.id } });
    await prisma.renglonPlan.update({
      where: { id: renglon.id },
      data: { precioCongelado: new Decimal(renglon.precioCongelado).add(1) },
    });

    const pasarela = crearPasarelaFalsa();
    await expect(cobrarAnticipo(plan.id, { pasarela })).rejects.toThrow(/no cuadran.*R7/);
    expect(pasarela.llamadas).toBe(0);
  });
});

describe("S1-03 · reglas de armado en el motor", () => {
  it("agregar a un paquete cerrado: precio de conjunto + lista, renglón AGREGADA", async () => {
    const { plan } = await alta(DEPA_2R, "confort", { cocina: 1, closets: 1, carp: 1, clima: 4, panel: 1 });

    expect(plan.modalidad).toBe("PAQUETE");
    expect(Number(plan.montoCongelado)).toBe(176200 + 9700 + 8500);
    const agregadas = (await renglonesDe(plan.id)).filter((r) => r.origen === "AGREGADA");
    expect(agregadas).toEqual([
      { clave: "clima", cantidad: 1, precioLista: 9700, precioCongelado: 9700, origen: "AGREGADA" },
      { clave: "panel", cantidad: 1, precioLista: 8500, precioCongelado: 8500, origen: "AGREGADA" },
    ]);
  });

  it("quitar de un paquete cerrado: todo a lista, sin precio de conjunto, y la bitácora lo avisa", async () => {
    const { plan } = await alta(DEPA_2R, "confort", { cocina: 1, closets: 1, carp: 1 });

    expect(plan.modalidad).toBe("A_LISTA");
    expect(plan.precioId).toBeNull();
    expect(Number(plan.montoCongelado)).toBe(78000 + 54600 + 14700);
    expect((await renglonesDe(plan.id)).every((r) => r.precioCongelado === r.precioLista * r.cantidad)).toBe(true);

    const [cotizado] = await eventosDelPlan(plan.id);
    expect(cotizado.comentario).toContain(
      "Al quitar Clima minisplit, Confort deja de ser paquete: lo que queda se cobra a precio de lista. Pagas $200 más"
    );
  });

  it("una canasta desde cero se guarda como «Arma el tuyo», nunca como «paquete 5»", async () => {
    const { plan } = await alta(DEPA_2R, "arma-el-tuyo", { closets: 1, carp: 1, clima: 2 });
    const armable = await paquete("arma-el-tuyo");

    expect(plan.modalidad).toBe("ARMA_EL_TUYO");
    expect(plan.paqueteId).toBe(armable.id);
    expect(plan.precioId).toBeNull();
    expect(await renglonesDe(plan.id)).toEqual([
      { clave: "closets", cantidad: 1, precioLista: 54600, precioCongelado: 54600, origen: "AGREGADA" },
      { clave: "carp", cantidad: 1, precioLista: 14700, precioCongelado: 14700, origen: "AGREGADA" },
      { clave: "clima", cantidad: 2, precioLista: 9700, precioCongelado: 19400, origen: "AGREGADA" },
    ]);
  });

  it("«Arma el tuyo» sin canasta, o con cocina, no se da de alta", async () => {
    await expect(alta(DEPA_2R, "arma-el-tuyo")).rejects.toThrow(/necesita la canasta/);
    await expect(alta(DEPA_2R, "arma-el-tuyo", { cocina: 1, closets: 1 })).rejects.toThrow(/paquete cerrado/);
  });

  it("debajo del mínimo no se genera plan, y el mensaje lo explica", async () => {
    // Un depa D (Santa Lucía) con clósets y un clima: $25,500.
    const unidad = await unidadLibre("DEPA D");
    const intento = darDeAlta({
      nombre: "Comprador de prueba",
      contacto: "81",
      unidadId: unidad.id,
      paqueteId: (await paquete("arma-el-tuyo")).id,
      canasta: { closets: 1, clima: 1 },
    });

    await expect(intento).rejects.toThrow(ReglaError);
    await expect(intento).rejects.toThrow(
      "El total ($25,500) no llega al mínimo para financiar de este proyecto ($50,000), así que no se genera plan a 12 meses"
    );
    // Y no queda un comprador suelto sin plan.
    expect(await prisma.comprador.count({ where: { unidadId: unidad.id } })).toBe(0);
    expect(await prisma.plan.count()).toBe(0);
  });

  it("el mínimo se lee del proyecto, no de una constante", async () => {
    const unidad = await unidadLibre(DEPA_2R);
    await prisma.proyecto.update({ where: { id: unidad.proyectoId }, data: { minimoPlan: 200000 } });

    await expect(alta(DEPA_2R, "confort")).rejects.toThrow(/\(\$200,000\)/);

    await prisma.proyecto.update({ where: { id: unidad.proyectoId }, data: { minimoPlan: 20000 } });
    const { plan } = await alta(DEPA_2R, "arma-el-tuyo", { carp: 1, clima: 1 });
    expect(Number(plan.montoCongelado)).toBe(14700 + 9700);
  });

  it("altas simultáneas en unidades distintas: todas pasan, cada una con su folio", async () => {
    const unidades = await Promise.all([1, 2, 3, 4, 5].map(() => unidadLibre(DEPA_2R)));
    const confort = await paquete("confort");
    const altas = await Promise.allSettled(
      unidades.map((u, i) =>
        darDeAlta({ nombre: `Comprador ${i}`, contacto: "81", unidadId: u.id, paqueteId: confort.id })
      )
    );
    expect(altas.filter((a) => a.status === "rejected")).toEqual([]);
    const folios = (await prisma.comprador.findMany()).map((c) => c.folio).sort();
    expect(folios).toEqual(["DU-001", "DU-002", "DU-003", "DU-004", "DU-005"]);
  });

  it("dos altas simultáneas de la misma unidad: una pasa y la otra dice por qué no", async () => {
    const unidad = await unidadLibre(DEPA_2R);
    const confort = await paquete("confort");
    const altas = await Promise.allSettled(
      ["Ana", "Beto"].map((nombre) =>
        darDeAlta({ nombre, contacto: "81", unidadId: unidad.id, paqueteId: confort.id })
      )
    );
    expect(altas.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const rechazo = altas.find((a) => a.status === "rejected") as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(ReglaError);
    expect(rechazo.reason.message).toMatch(/ya está dada de alta/);
    expect(await prisma.plan.count()).toBe(1);
  });

  it("generarPlan también aplica las reglas para un comprador ya registrado", async () => {
    const unidad = await unidadLibre(DEPA_2R);
    const comprador = await prisma.comprador.create({
      data: { nombre: "Ya registrado", contacto: "81", unidadId: unidad.id, folio: "DU-900" },
    });
    const plan = await generarPlan({
      compradorId: comprador.id,
      paqueteId: (await paquete("plus")).id,
      canasta: { cocina: 1, closets: 1, carp: 1, clima: 3, panel: 1 },
    });
    expect(plan.modalidad).toBe("A_LISTA");
    await expect(
      generarPlan({ compradorId: comprador.id, paqueteId: (await paquete("plus")).id })
    ).rejects.toThrow(/ya tiene un plan abierto/);
  });
});

describe("S1-04 · el alta y el sitio dan el mismo total para la misma canasta", () => {
  it("con el catálogo que ve el sitio y el que usa el motor, en paquetes, cambios y «Arma el tuyo»", async () => {
    const sitio = await cargarCatalogosPorProyecto();
    const armable = sitio.armable!;
    let casos = 0;

    for (const proyecto of sitio.proyectos) {
      for (const proto of proyecto.prototipos) {
        // Cada prototipo contra el catálogo del motor para su unidad.
        const motor = await cargarCatalogo(proto.id);
        expect(motor.prototipo).toEqual(proto);

        const canastas: { paqueteId: string | null; canasta?: Record<string, number> }[] = [
          ...proto.paquetes.map((p) => ({ paqueteId: p.id })),
          { paqueteId: proto.paquetes[1].id, canasta: { ...contenidoComoCanasta(proto.paquetes[1]), panel: 1 } },
          { paqueteId: proto.paquetes[2].id, canasta: { ...contenidoComoCanasta(proto.paquetes[2]), lavado: 0 } },
          { paqueteId: null, canasta: canastaInicialArmaElTuyo(proto.partidas, proto.climasDefault) },
          { paqueteId: null, canasta: { closets: 1, carp: 1, clima: proto.climasDefault, tv: 1, refri: 1 } },
        ];

        for (const eleccion of canastas) {
          const enSitio = cotizarEnCatalogo(proto, eleccion).cotizacion.total;
          if (enSitio < proyecto.minimoPlan) continue;

          const unidad = await unidadLibre(proto.clave);
          const { plan } = await darDeAlta({
            nombre: "Comprador de prueba",
            contacto: "81",
            unidadId: unidad.id,
            paqueteId: eleccion.paqueteId ?? armable.id,
            canasta: eleccion.canasta,
          });
          expect(Number(plan.montoCongelado)).toBe(enSitio);
          casos++;
        }
      }
    }
    expect(casos).toBeGreaterThan(80);
  });
});
