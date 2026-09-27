import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ReglaError } from "./errores";
import type {
  PaqueteArmable,
  PartidaDelCatalogo,
  PaqueteDelCatalogo,
  ProyectoCotizable,
  PrototipoCotizable,
} from "./canasta";

export type { PaqueteArmable, PartidaDelCatalogo, PaqueteDelCatalogo, ProyectoCotizable, PrototipoCotizable };

/**
 * De la base a lo que `cotizar` necesita. Lo usan el cotizador del sitio, el
 * alta y el motor al generar el plan: si los tres leen el catálogo con esta
 * misma función y cotizan con la misma `cotizar`, dan el mismo total para la
 * misma canasta (S1-04).
 */

export type CatalogoCotizable = {
  proyecto: ProyectoCotizable;
  prototipo: PrototipoCotizable;
  armable: PaqueteArmable | null;
};

const conPrecios = {
  precios: true,
  preciosPartida: true,
} satisfies Prisma.PrototipoInclude;

type PrototipoConPrecios = Prisma.PrototipoGetPayload<{ include: typeof conPrecios }>;
type PaqueteConCatalogo = Prisma.PaqueteGetPayload<{ include: { catalogo: { select: { id: true } } } }>;
type Partida = Prisma.PartidaGetPayload<object>;
type Proyecto = Prisma.ProyectoGetPayload<object>;

/** El catálogo con el que se cotiza en un prototipo. */
export async function cargarCatalogo(prototipoId: string, ahora = new Date()): Promise<CatalogoCotizable> {
  const [prototipo, partidas, paquetes] = await Promise.all([
    prisma.prototipo.findUnique({
      where: { id: prototipoId },
      include: { ...conPrecios, proyecto: true },
    }),
    cargarPartidas(),
    cargarPaquetes(),
  ]);
  if (!prototipo) throw new ReglaError("No se encontró el prototipo de la unidad.");

  return {
    proyecto: aProyecto(prototipo.proyecto),
    prototipo: aPrototipo(prototipo, partidas, paquetes, ahora),
    armable: aArmable(paquetes),
  };
}

/** Todos los proyectos con sus prototipos, para el cotizador del sitio. */
export async function cargarCatalogosPorProyecto(ahora = new Date()) {
  const [proyectos, partidas, paquetes] = await Promise.all([
    prisma.proyecto.findMany({
      include: { prototipos: { include: conPrecios, orderBy: { clave: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    cargarPartidas(),
    cargarPaquetes(),
  ]);

  return {
    armable: aArmable(paquetes),
    proyectos: proyectos.map((proyecto) => ({
      ...aProyecto(proyecto),
      prototipos: proyecto.prototipos
        .map((p) => aPrototipo(p, partidas, paquetes, ahora))
        .filter((p) => p.paquetes.length > 0),
    })),
  };
}

/**
 * Un monto de catálogo en pesos enteros. Los precios de lista vienen
 * redondeados a la centena (spec §4); uno con centavos es un error de
 * captura y se dice, en vez de redondearlo en silencio.
 */
export function pesosEnteros(monto: Prisma.Decimal | number | string, que: string): number {
  const d = new Prisma.Decimal(monto);
  if (!d.isInteger()) {
    throw new ReglaError(`El precio de ${que} (${d.toFixed(2)}) trae centavos: los precios de lista se capturan en pesos enteros.`);
  }
  return d.toNumber();
}

// ── internos ──────────────────────────────────────────────────────────────

function cargarPartidas() {
  return prisma.partida.findMany({ orderBy: { orden: "asc" } });
}

function cargarPaquetes() {
  return prisma.paquete.findMany({
    include: { catalogo: { select: { id: true } } },
    orderBy: { nivel: "asc" },
  });
}

function aProyecto(proyecto: Proyecto): ProyectoCotizable {
  return {
    id: proyecto.id,
    nombre: proyecto.nombre,
    anticipoBP: new Prisma.Decimal(proyecto.porcentajeAnticipo).mul(10000).toDecimalPlaces(0).toNumber(),
    minimoPlan: pesosEnteros(proyecto.minimoPlan, `el mínimo para financiar de ${proyecto.nombre}`),
  };
}

function aArmable(paquetes: PaqueteConCatalogo[]): PaqueteArmable | null {
  const armable = paquetes.find((p) => p.esArmable);
  return armable ? { id: armable.id, nombre: armable.nombre, nivel: armable.nivel, slug: armable.slug } : null;
}

function aPrototipo(
  prototipo: PrototipoConPrecios,
  partidas: Partida[],
  paquetes: PaqueteConCatalogo[],
  ahora: Date
): PrototipoCotizable {
  const listaPorPartida = new Map(prototipo.preciosPartida.map((pp) => [pp.partidaId, pp.monto]));
  const cotizables: PartidaDelCatalogo[] = partidas.map((p) => {
    const lista = listaPorPartida.get(p.id);
    return {
      id: p.id,
      clave: p.clave,
      nombre: p.nombre,
      familia: p.familia,
      armable: p.armable,
      porEquipo: p.porEquipo,
      porDefecto: p.porDefecto,
      orden: p.orden,
      precioLista: lista === undefined ? null : pesosEnteros(lista, `«${p.nombre}» en ${prototipo.clave}`),
    };
  });
  const clavePorId = new Map(partidas.map((p) => [p.id, p]));

  const cerrados = paquetes.filter((p) => !p.esArmable);
  const conPrecio: PaqueteDelCatalogo[] = [];
  for (const paquete of cerrados) {
    const precio = precioVigente(prototipo.precios, paquete.id, ahora);
    if (!precio) continue;

    // Acumulativos: el 03 trae lo del 01 y el 02. Los climas, los del prototipo.
    const contenido: Record<string, number> = {};
    for (const anterior of cerrados.filter((p) => p.nivel <= paquete.nivel)) {
      for (const { id } of anterior.catalogo) {
        const partida = clavePorId.get(id)!;
        const cantidad = partida.porEquipo ? prototipo.climasDefault : 1;
        if (cantidad > 0) contenido[partida.clave] = cantidad;
      }
    }

    conPrecio.push({
      id: paquete.id,
      nombre: paquete.nombre,
      nivel: paquete.nivel,
      slug: paquete.slug,
      precio: pesosEnteros(precio.monto, `${paquete.nombre} en ${prototipo.clave}`),
      precioId: precio.id,
      contenido,
    });
  }

  return {
    id: prototipo.id,
    clave: prototipo.clave,
    superficie: Number(prototipo.superficie),
    recamaras: prototipo.recamaras,
    climasDefault: prototipo.climasDefault,
    partidas: cotizables,
    paquetes: conPrecio,
  };
}

/**
 * El precio vigente de un paquete en un prototipo: el más reciente que ya
 * empezó y no ha terminado. Los precios se versionan, nunca se sobreescriben.
 */
function precioVigente(precios: PrototipoConPrecios["precios"], paqueteId: string, ahora: Date) {
  return precios
    .filter(
      (p) =>
        p.paqueteId === paqueteId &&
        p.vigenteDesde <= ahora &&
        (p.vigenteHasta === null || p.vigenteHasta > ahora)
    )
    .sort((a, b) => b.vigenteDesde.getTime() - a.vigenteDesde.getTime())[0];
}
