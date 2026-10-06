import { randomUUID } from "node:crypto";
import { EstadoOperativo, EstadoPlan, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { almacenamiento as almacenPorDefecto, type Almacenamiento } from "../almacenamiento";
import { ReglaError } from "./errores";
import {
  MAX_FOTOS_POR_PARTIDA,
  extensionDe,
  mensajeMaximoFotos,
  validarFoto,
} from "./fotos";

/**
 * Lo que el comprador elige de cada partida (S1-05): una opción de acabado y
 * hasta dos fotos de referencia. Se captura al apartar y viaja con la compra
 * (Anexo A, expediente, orden de producción). Se puede cambiar hasta el
 * levantamiento en obra; después, R6 lo deja fijo.
 */

type Opciones = { almacen?: Almacenamiento };

const conUnidad = {
  partida: true,
  fotos: true,
  plan: { include: { comprador: { include: { unidad: true } } } },
} satisfies Prisma.RenglonPlanInclude;

async function renglonEditable(renglonId: string, que: string) {
  const renglon = await prisma.renglonPlan.findUnique({ where: { id: renglonId }, include: conUnidad });
  if (!renglon) throw new ReglaError("No se encontró la partida del plan.");
  asegurarEditable(renglon, que);
  return renglon;
}

type RenglonConUnidad = Prisma.RenglonPlanGetPayload<{ include: typeof conUnidad }>;

/** R6 y plan vivo. `que` completa el mensaje: «el acabado», «las fotos». */
function asegurarEditable(renglon: RenglonConUnidad, que: string) {
  if (renglon.plan.estado === EstadoPlan.CANCELADO) {
    throw new ReglaError(`El plan está cancelado: ya no se cambian ${que}.`);
  }
  const { estadoOperativo } = renglon.plan.comprador.unidad;
  if (estadoOperativo !== EstadoOperativo.PENDIENTE) {
    throw new ReglaError(
      `Ya no se ${que.startsWith("las ") ? "pueden" : "puede"} cambiar ${que} de «${renglon.partida.nombre}»: ya se hizo el levantamiento en obra (la unidad está en ${estadoOperativo}) y desde ahí no hay cambios de acabados (R6).`
    );
  }
}

/** Las opciones de acabado de una partida del catálogo: [nombre, color][]. */
function opcionesDe(acabados: Prisma.JsonValue): string[] {
  if (!Array.isArray(acabados)) return [];
  return acabados.filter(Array.isArray).map((a) => String(a[0]));
}

/** Sin el «Opción 2 · » del catálogo: «Nogal». */
export function nombreCorto(acabado: string): string {
  return acabado.replace(/^Opción \d+ · /, "");
}

export async function elegirAcabado(params: { renglonId: string; acabado: string }) {
  const renglon = await renglonEditable(params.renglonId, "el acabado");
  const opciones = opcionesDe(renglon.partida.acabados);
  if (opciones.length === 0) {
    throw new ReglaError(`«${renglon.partida.nombre}» no tiene opciones de acabado que elegir.`);
  }
  if (!opciones.includes(params.acabado)) {
    throw new ReglaError(
      `«${params.acabado}» no es un acabado de «${renglon.partida.nombre}». Las opciones son: ${opciones.map(nombreCorto).join(", ")}.`
    );
  }
  if (renglon.acabado === params.acabado) return renglon;

  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.renglonPlan.update({
      where: { id: renglon.id },
      data: { acabado: params.acabado },
    });
    await tx.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: renglon.planId,
        tipo: "acabado_elegido",
        estadoAnterior: renglon.acabado,
        estadoNuevo: params.acabado,
        comentario: renglon.acabado
          ? `${renglon.partida.nombre}: el acabado cambió de ${nombreCorto(renglon.acabado)} a ${nombreCorto(params.acabado)}.`
          : `${renglon.partida.nombre}: se eligió el acabado ${nombreCorto(params.acabado)}.`,
      },
    });
    return actualizado;
  });
}

/**
 * Sube una foto de referencia. Primero valida todo (tipo, tamaño, R6, que no
 * tenga ya dos), luego guarda el archivo y al final el registro. Si el
 * registro falla, borra el archivo: no quedan fotos huérfanas en el almacén.
 */
export async function subirFotoReferencia(
  params: { renglonId: string; nombre: string; contenido: Uint8Array },
  opciones: Opciones = {}
) {
  const almacen = opciones.almacen ?? almacenPorDefecto;
  const tipo = validarFoto(params);
  const renglon = await renglonEditable(params.renglonId, "las fotos");
  if (renglon.fotos.length >= MAX_FOTOS_POR_PARTIDA) {
    throw new ReglaError(mensajeMaximoFotos(renglon.partida.nombre));
  }

  const clave = `fotos/${renglon.id}/${randomUUID()}.${extensionDe(tipo)}`;
  await almacen.guardar(clave, params.contenido);

  try {
    return await prisma.$transaction(async (tx) => {
      const ocupadas = new Set(
        (await tx.fotoReferencia.findMany({ where: { renglonId: renglon.id } })).map((f) => f.posicion)
      );
      const posicion = [1, 2].find((p) => !ocupadas.has(p));
      if (!posicion) throw new ReglaError(mensajeMaximoFotos(renglon.partida.nombre));

      const foto = await tx.fotoReferencia.create({
        data: {
          renglonId: renglon.id,
          posicion,
          clave,
          nombreOriginal: params.nombre.slice(0, 200),
          tipo,
          bytes: params.contenido.byteLength,
        },
      });
      await tx.evento.create({
        data: {
          entidadTipo: "plan",
          entidadId: renglon.planId,
          tipo: "foto_referencia_subida",
          comentario: `${renglon.partida.nombre}: se subió la foto de referencia «${foto.nombreOriginal}» (${posicion} de ${MAX_FOTOS_POR_PARTIDA}).`,
        },
      });
      return foto;
    });
  } catch (err) {
    await almacen.borrar(clave);
    // Dos subidas al mismo tiempo pelearon por el mismo lugar: la otra ganó.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ReglaError(mensajeMaximoFotos(renglon.partida.nombre));
    }
    throw err;
  }
}

export async function quitarFotoReferencia(params: { fotoId: string }, opciones: Opciones = {}) {
  const almacen = opciones.almacen ?? almacenPorDefecto;
  const foto = await prisma.fotoReferencia.findUnique({
    where: { id: params.fotoId },
    include: { renglon: { include: conUnidad } },
  });
  if (!foto) throw new ReglaError("No se encontró la foto.");
  asegurarEditable(foto.renglon, "las fotos");

  await prisma.$transaction(async (tx) => {
    await tx.fotoReferencia.delete({ where: { id: foto.id } });
    await tx.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: foto.renglon.planId,
        tipo: "foto_referencia_quitada",
        comentario: `${foto.renglon.partida.nombre}: se quitó la foto de referencia «${foto.nombreOriginal}».`,
      },
    });
  });
  // Después del registro: si el borrado del archivo fallara, lo peor es un
  // archivo sin dueño, nunca un registro que apunta a nada.
  await almacen.borrar(foto.clave);
}

/** El archivo de una foto, para servirlo desde /api/fotos/<id>. */
export async function leerFotoReferencia(fotoId: string, opciones: Opciones = {}) {
  const almacen = opciones.almacen ?? almacenPorDefecto;
  const foto = await prisma.fotoReferencia.findUnique({ where: { id: fotoId } });
  if (!foto) return null;
  const contenido = await almacen.leer(foto.clave);
  if (!contenido) return null;
  return { tipo: foto.tipo, nombre: foto.nombreOriginal, contenido };
}
