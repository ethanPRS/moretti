import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { crearPasarelaFalsa, rechazo } from "@/lib/pasarela/falsa";
import { cobrarExhibicion, darDeAlta, registrarContrato } from "./planes";
import { baseLimpiaConCatalogo, paquete, unidadLibre } from "@/pruebas/utilidades";

/**
 * Actividad W (Sprint 3): un plan entero, de punta a punta, contra la
 * pasarela falsa. Alta → contrato → anticipo → doce mensualidades, con un
 * rechazo y su reintento en medio, hasta LIQUIDADO. La bitácora tiene que
 * contar la historia completa, sin huecos.
 *
 * Lo mismo contra Stripe en modo prueba es de Charly (necesita O y P).
 */

beforeEach(baseLimpiaConCatalogo);

describe("W · los 13 cobros de un plan completo", () => {
  it("llega a LIQUIDADO, cuadra al peso y la bitácora cuenta la historia completa", async () => {
    // La mensualidad 5 la rechaza el banco la primera vez (fondos insuficientes).
    const pasarela = crearPasarelaFalsa({
      decidir: (s) =>
        s.numeroExhibicion === 5 && s.intento === 1
          ? rechazo("insufficient_funds", true)
          : { estado: "exitoso", referenciaPasarela: `ch_${s.numeroExhibicion}_${s.intento}` },
    });

    const unidad = await unidadLibre("DEPA 2R (tipo 717)");
    const { plan, comprador } = await darDeAlta({
      nombre: "Comprador extremo a extremo",
      contacto: "81 0000 0000",
      unidadId: unidad.id,
      paqueteId: (await paquete("casa-lista")).id,
    });
    await registrarContrato({
      unidadId: unidad.id,
      archivoNombre: "contrato.pdf",
      quienFirmo: comprador.nombre,
      fechaFirma: new Date(),
    });

    const exhibiciones = await prisma.exhibicion.findMany({ where: { planId: plan.id }, orderBy: { numero: "asc" } });
    expect(exhibiciones).toHaveLength(13);

    const rechazos: number[] = [];
    for (const e of exhibiciones) {
      const r = await cobrarExhibicion(e.id, { pasarela });
      if (r.estado === "rechazado") {
        rechazos.push(e.numero);
        expect(r.mensaje).toMatch(/insufficient_funds/);
        // El reintento va con el intento 2, o sea con llave nueva.
        const reintento = await cobrarExhibicion(e.id, { pasarela });
        expect(reintento.estado).toBe("exitoso");
      } else {
        expect(r.estado).toBe("exitoso");
      }
    }
    expect(rechazos).toEqual([5]);

    // Liquidado en los tres lugares.
    const final = await prisma.plan.findUniqueOrThrow({
      where: { id: plan.id },
      include: { exhibiciones: true, pagos: { include: { comprobante: true } }, comprador: { include: { unidad: true } } },
    });
    expect(final.estado).toBe("LIQUIDADO");
    expect(Number(final.saldo)).toBe(0);
    expect(final.comprador.unidad.estadoFinanciero).toBe("LIQUIDADO");

    // Al peso: 13 pagos que suman el precio congelado; uno por exhibición.
    expect(final.pagos).toHaveLength(13);
    expect(final.pagos.reduce((a, p) => a + Number(p.monto), 0)).toBe(Number(final.montoCongelado));
    expect(final.exhibiciones.every((e) => e.estado === "PAGADA")).toBe(true);
    expect(final.exhibiciones.find((e) => e.numero === 5)!.intentosRechazados).toBe(1);
    // Un cargo por exhibición; 14 llamadas porque una se rechazó y se reintentó.
    expect(pasarela.cargos.length).toBe(13);
    expect(pasarela.llamadas).toBe(14);
    // R8: cada pago con su comprobante pendiente.
    expect(final.pagos.every((p) => p.comprobante?.estado === "PENDIENTE")).toBe(true);

    // La historia en la bitácora, en orden y sin huecos.
    const eventos = await prisma.evento.findMany({
      where: { OR: [{ entidadId: plan.id }, { entidadId: unidad.id }] },
      orderBy: { fecha: "asc" },
    });
    const tipos = eventos.map((e) => e.tipo);
    expect(tipos[0]).toBe("plan_cotizado");
    expect(tipos).toContain("contrato_registrado");
    expect(tipos.filter((t) => t === "anticipo_cobrado")).toHaveLength(1);
    expect(tipos.filter((t) => t === "exhibicion_cobrada")).toHaveLength(12);
    expect(tipos.filter((t) => t === "cobro_rechazado")).toHaveLength(1);
    expect(tipos.filter((t) => t === "comprobante_pendiente")).toHaveLength(13);
    const pasos = eventos.filter((e) => e.tipo === "estado_financiero_cambiado").map((e) => `${e.estadoAnterior}→${e.estadoNuevo}`);
    expect(pasos).toEqual(["COTIZADO→APARTADO", "APARTADO→AL_CORRIENTE", "AL_CORRIENTE→LIQUIDADO"]);
    // El rechazo quedó antes de su reintento.
    const iRechazo = tipos.indexOf("cobro_rechazado");
    const cobradas = eventos.filter((e) => e.tipo === "exhibicion_cobrada").map((e) => e.comentario ?? "");
    expect(eventos[iRechazo].comentario).toMatch(/la mensualidad 5.*intento 1/);
    expect(eventos.findIndex((e) => e.comentario?.startsWith("Exhibición 5 "))).toBeGreaterThan(iRechazo);
    expect(cobradas).toHaveLength(12);
  });
});
