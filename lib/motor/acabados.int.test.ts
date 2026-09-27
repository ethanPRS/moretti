import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { crearAlmacenLocal } from "@/lib/almacenamiento/local";
import type { Almacenamiento } from "@/lib/almacenamiento/contrato";
import { crearPasarelaFalsa } from "@/lib/pasarela/falsa";
import {
  elegirAcabado,
  leerFotoReferencia,
  quitarFotoReferencia,
  subirFotoReferencia,
} from "./acabados";
import { cobrarAnticipo, darDeAlta } from "./planes";
import { baseLimpiaConCatalogo, eventosDelPlan, firmarContrato, paquete, unidadLibre } from "@/pruebas/utilidades";

const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6]);
const HEIC = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);

let carpeta: string;
let almacen: Almacenamiento;

async function archivosEn(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
  return entradas.filter((e) => e.isFile()).map((e) => e.name);
}

/** Un plan Confort en DEPA 2R; devuelve sus renglones por clave. */
async function planConfort() {
  const unidad = await unidadLibre("DEPA 2R (tipo 717)");
  const { plan } = await darDeAlta({
    nombre: "Comprador de prueba",
    contacto: "81",
    unidadId: unidad.id,
    paqueteId: (await paquete("confort")).id,
  });
  const renglones = await prisma.renglonPlan.findMany({ where: { planId: plan.id }, include: { partida: true } });
  const de = (clave: string) => renglones.find((r) => r.partida.clave === clave)!;
  return { unidad, plan, cocina: de("cocina"), closets: de("closets"), clima: de("clima") };
}

beforeEach(async () => {
  await baseLimpiaConCatalogo();
  carpeta = await mkdtemp(path.join(tmpdir(), "moretti-almacen-"));
  almacen = crearAlmacenLocal(carpeta);
});

afterEach(async () => {
  await rm(carpeta, { recursive: true, force: true });
});

describe("S1-05 · acabado elegido por partida", () => {
  it("se elige uno de los del catálogo y queda en la bitácora", async () => {
    const { plan, cocina } = await planConfort();

    await elegirAcabado({ renglonId: cocina.id, acabado: "Opción 2 · Nogal" });
    await elegirAcabado({ renglonId: cocina.id, acabado: "Opción 3 · Blanco mate" });

    const guardado = await prisma.renglonPlan.findUniqueOrThrow({ where: { id: cocina.id } });
    expect(guardado.acabado).toBe("Opción 3 · Blanco mate");
    const eventos = (await eventosDelPlan(plan.id)).filter((e) => e.tipo === "acabado_elegido");
    expect(eventos.map((e) => e.comentario)).toEqual([
      "Cocina integral sobre diseño: se eligió el acabado Nogal.",
      "Cocina integral sobre diseño: el acabado cambió de Nogal a Blanco mate.",
    ]);
  });

  it("no acepta un acabado que no es del catálogo, y dice cuáles sí", async () => {
    const { cocina } = await planConfort();
    await expect(elegirAcabado({ renglonId: cocina.id, acabado: "Caoba" })).rejects.toThrow(
      "«Caoba» no es un acabado de «Cocina integral sobre diseño». Las opciones son: Roble claro, Nogal, Blanco mate."
    );
  });

  it("una partida sin acabados no tiene qué elegir", async () => {
    const { clima } = await planConfort();
    await expect(elegirAcabado({ renglonId: clima.id, acabado: "Blanco" })).rejects.toThrow(
      /no tiene opciones de acabado/
    );
  });

  it("congelar el precio con el anticipo no congela el acabado: eso es hasta el levantamiento", async () => {
    const { unidad, plan, cocina } = await planConfort();
    await firmarContrato(unidad.id);
    await cobrarAnticipo(plan.id, { pasarela: crearPasarelaFalsa() });

    await elegirAcabado({ renglonId: cocina.id, acabado: "Opción 1 · Roble claro" });
    expect((await prisma.renglonPlan.findUniqueOrThrow({ where: { id: cocina.id } })).acabado).toBe(
      "Opción 1 · Roble claro"
    );
  });
});

describe("S1-05 · fotos de referencia", () => {
  it("acepta hasta dos por partida; la tercera se rechaza con un mensaje claro", async () => {
    const { plan, closets } = await planConfort();

    await subirFotoReferencia({ renglonId: closets.id, nombre: "panel.jpg", contenido: JPG }, { almacen });
    await subirFotoReferencia({ renglonId: closets.id, nombre: "color.png", contenido: PNG }, { almacen });
    await expect(
      subirFotoReferencia({ renglonId: closets.id, nombre: "otra.jpg", contenido: JPG }, { almacen })
    ).rejects.toThrow(
      "«Clósets de recámaras» ya tiene 2 fotos de referencia, que es el máximo. Quita una para subir otra."
    );

    const fotos = await prisma.fotoReferencia.findMany({ where: { renglonId: closets.id }, orderBy: { posicion: "asc" } });
    expect(fotos.map((f) => [f.posicion, f.nombreOriginal, f.tipo])).toEqual([
      [1, "panel.jpg", "image/jpeg"],
      [2, "color.png", "image/png"],
    ]);
    expect(await archivosEn(carpeta)).toHaveLength(2);
    expect((await eventosDelPlan(plan.id)).filter((e) => e.tipo === "foto_referencia_subida")).toHaveLength(2);
  });

  it("las dos fotos son por partida: otra partida tiene sus propias dos", async () => {
    const { cocina, closets } = await planConfort();
    for (const renglon of [cocina, closets]) {
      for (const nombre of ["a.jpg", "b.jpg"]) {
        await subirFotoReferencia({ renglonId: renglon.id, nombre, contenido: JPG }, { almacen });
      }
    }
    expect(await prisma.fotoReferencia.count()).toBe(4);
  });

  it("lo que no es JPG o PNG no se guarda ni en la base ni en el almacén", async () => {
    const { closets } = await planConfort();
    await expect(
      subirFotoReferencia({ renglonId: closets.id, nombre: "IMG_0042.jpg", contenido: HEIC }, { almacen })
    ).rejects.toThrow(/no es una foto JPG ni PNG/);
    expect(await prisma.fotoReferencia.count()).toBe(0);
    expect(await archivosEn(carpeta)).toHaveLength(0);
  });

  it("quitar una foto borra el registro y el archivo, y libera su lugar", async () => {
    const { plan, closets } = await planConfort();
    const primera = await subirFotoReferencia({ renglonId: closets.id, nombre: "1.jpg", contenido: JPG }, { almacen });
    await subirFotoReferencia({ renglonId: closets.id, nombre: "2.jpg", contenido: JPG }, { almacen });

    await quitarFotoReferencia({ fotoId: primera.id }, { almacen });
    expect(await archivosEn(carpeta)).toHaveLength(1);

    const nueva = await subirFotoReferencia({ renglonId: closets.id, nombre: "3.png", contenido: PNG }, { almacen });
    expect(nueva.posicion).toBe(1);
    expect((await eventosDelPlan(plan.id)).some((e) => e.tipo === "foto_referencia_quitada")).toBe(true);
  });

  it("dos subidas al mismo tiempo no dejan tres fotos ni archivos huérfanos", async () => {
    const { closets } = await planConfort();
    await subirFotoReferencia({ renglonId: closets.id, nombre: "1.jpg", contenido: JPG }, { almacen });

    const resultados = await Promise.allSettled([
      subirFotoReferencia({ renglonId: closets.id, nombre: "a.jpg", contenido: JPG }, { almacen }),
      subirFotoReferencia({ renglonId: closets.id, nombre: "b.jpg", contenido: JPG }, { almacen }),
    ]);

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.fotoReferencia.count({ where: { renglonId: closets.id } })).toBe(2);
    expect(await archivosEn(carpeta)).toHaveLength(2);
  });

  it("se lee de vuelta tal cual se subió", async () => {
    const { closets } = await planConfort();
    const foto = await subirFotoReferencia({ renglonId: closets.id, nombre: "c.png", contenido: PNG }, { almacen });
    const leida = await leerFotoReferencia(foto.id, { almacen });
    expect(leida?.tipo).toBe("image/png");
    expect([...leida!.contenido]).toEqual([...PNG]);
  });

  it("cambiar de proveedor de almacenamiento no toca el motor", async () => {
    // Un almacén en memoria, como sería uno en la nube: misma interfaz.
    const memoria = new Map<string, Uint8Array>();
    const enMemoria: Almacenamiento = {
      async guardar(clave, contenido) {
        memoria.set(clave, contenido);
      },
      async leer(clave) {
        return memoria.get(clave) ?? null;
      },
      async borrar(clave) {
        memoria.delete(clave);
      },
    };
    const { closets } = await planConfort();
    const foto = await subirFotoReferencia({ renglonId: closets.id, nombre: "m.jpg", contenido: JPG }, { almacen: enMemoria });
    expect(memoria.size).toBe(1);
    expect((await leerFotoReferencia(foto.id, { almacen: enMemoria }))?.tipo).toBe("image/jpeg");
    await quitarFotoReferencia({ fotoId: foto.id }, { almacen: enMemoria });
    expect(memoria.size).toBe(0);
  });
});

describe("S1-05 · R6: después del levantamiento ya no hay cambios", () => {
  it("ni acabado, ni fotos nuevas, ni quitar las que había; y el error dice por qué", async () => {
    const { unidad, cocina, closets } = await planConfort();
    await elegirAcabado({ renglonId: cocina.id, acabado: "Opción 2 · Nogal" });
    const foto = await subirFotoReferencia({ renglonId: closets.id, nombre: "1.jpg", contenido: JPG }, { almacen });

    await prisma.unidad.update({ where: { id: unidad.id }, data: { estadoOperativo: "LEVANTAMIENTO_HECHO" } });

    await expect(elegirAcabado({ renglonId: cocina.id, acabado: "Opción 1 · Roble claro" })).rejects.toThrow(
      "Ya no se puede cambiar el acabado de «Cocina integral sobre diseño»: ya se hizo el levantamiento en obra (la unidad está en LEVANTAMIENTO_HECHO) y desde ahí no hay cambios de acabados (R6)."
    );
    await expect(
      subirFotoReferencia({ renglonId: closets.id, nombre: "2.jpg", contenido: JPG }, { almacen })
    ).rejects.toThrow(/Ya no se pueden cambiar las fotos.*\(R6\)/);
    await expect(quitarFotoReferencia({ fotoId: foto.id }, { almacen })).rejects.toThrow(/\(R6\)/);

    expect((await prisma.renglonPlan.findUniqueOrThrow({ where: { id: cocina.id } })).acabado).toBe("Opción 2 · Nogal");
    expect(await prisma.fotoReferencia.count()).toBe(1);
    expect(await archivosEn(carpeta)).toHaveLength(1);
  });

  it("también en cualquier estado operativo posterior", async () => {
    const { unidad, cocina } = await planConfort();
    for (const estado of ["ACABADOS_ELEGIDOS", "EN_PRODUCCION", "PRODUCIDO", "EN_ALMACEN"] as const) {
      await prisma.unidad.update({ where: { id: unidad.id }, data: { estadoOperativo: estado } });
      await expect(elegirAcabado({ renglonId: cocina.id, acabado: "Opción 2 · Nogal" })).rejects.toThrow(/R6/);
    }
  });
});
