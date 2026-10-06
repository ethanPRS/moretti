import { EstadoPlan } from "@prisma/client";
import { prisma } from "../prisma";
import { ReglaError } from "./errores";
import {
  ETIQUETA_INSTALACION,
  ETIQUETA_OPERATIVO,
  faltantesInstalacion,
  faltantesOperativo,
  mensajeFaltantes,
  type EstadoInstalacion,
  type EstadoOperativo,
  type ExpedienteUnidad,
} from "./operacion";

/**
 * Avanza las máquinas operativa y de instalación de una unidad (actividad Q).
 * Las reglas viven en ./operacion.ts; aquí se lee el expediente, se valida,
 * se aplica condicionado al estado leído y se deja el evento.
 */

async function leerExpediente(unidadId: string) {
  const unidad = await prisma.unidad.findUnique({
    where: { id: unidadId },
    include: {
      actaEntrega: true,
      comprador: {
        include: {
          planes: {
            where: { estado: { in: [EstadoPlan.COTIZADO, EstadoPlan.ACTIVO, EstadoPlan.LIQUIDADO] } },
            include: { renglones: { include: { partida: true } } },
          },
        },
      },
    },
  });
  if (!unidad) throw new ReglaError("No se encontró la unidad.");

  const renglones = unidad.comprador?.planes.flatMap((p) => p.renglones) ?? [];
  const partidasSinAcabado = renglones
    .filter((r) => Array.isArray(r.partida.acabados) && r.partida.acabados.length > 0 && !r.acabado)
    .map((r) => r.partida.nombre);

  const expediente: ExpedienteUnidad = {
    financiero: unidad.estadoFinanciero,
    operativo: unidad.estadoOperativo,
    instalacion: unidad.estadoInstalacion,
    partidasSinAcabado,
    actaEntregaFirmada: Boolean(unidad.actaEntrega),
  };
  return { unidad, expediente };
}

/** Pasa la operativa al estado siguiente. Si falta algo, el error dice qué. */
export async function avanzarEstadoOperativo(params: {
  unidadId: string;
  hacia: EstadoOperativo;
  usuario?: string;
}) {
  const { unidad, expediente } = await leerExpediente(params.unidadId);
  const faltan = faltantesOperativo(expediente, params.hacia);
  if (faltan.length > 0) throw new ReglaError(mensajeFaltantes(ETIQUETA_OPERATIVO[params.hacia], faltan));

  const desde = unidad.estadoOperativo;
  return prisma.$transaction(async (tx) => {
    // Condicionado a lo leído: si alguien cambió algo mientras tanto, no se pisa.
    const { count } = await tx.unidad.updateMany({
      where: { id: unidad.id, estadoOperativo: desde, estadoFinanciero: expediente.financiero },
      data: { estadoOperativo: params.hacia },
    });
    if (count === 0) {
      throw new ReglaError("El estado de la unidad cambió mientras tanto. Recarga la página y vuelve a intentar.");
    }
    await tx.evento.create({
      data: {
        entidadTipo: "unidad",
        entidadId: unidad.id,
        tipo: "estado_operativo_cambiado",
        estadoAnterior: desde,
        estadoNuevo: params.hacia,
        usuario: params.usuario ?? "back office",
        comentario: `Operativa: ${ETIQUETA_OPERATIVO[desde]} → ${ETIQUETA_OPERATIVO[params.hacia]}.${
          params.hacia === "LEVANTAMIENTO_HECHO"
            ? " Desde aquí ya no se cambian paquete ni acabados (R6)."
            : ""
        }`,
      },
    });
    return { desde, hacia: params.hacia };
  });
}

/** Pasa la instalación al estado siguiente. Si falta algo, el error dice qué. */
export async function avanzarInstalacion(params: {
  unidadId: string;
  hacia: EstadoInstalacion;
  usuario?: string;
}) {
  const { unidad, expediente } = await leerExpediente(params.unidadId);
  const faltan = faltantesInstalacion(expediente, params.hacia);
  if (faltan.length > 0) throw new ReglaError(mensajeFaltantes(ETIQUETA_INSTALACION[params.hacia], faltan));

  const desde = unidad.estadoInstalacion;
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.unidad.updateMany({
      where: { id: unidad.id, estadoInstalacion: desde, estadoFinanciero: expediente.financiero },
      data: { estadoInstalacion: params.hacia },
    });
    if (count === 0) {
      throw new ReglaError("El estado de la unidad cambió mientras tanto. Recarga la página y vuelve a intentar.");
    }
    await tx.evento.create({
      data: {
        entidadTipo: "unidad",
        entidadId: unidad.id,
        tipo: "estado_instalacion_cambiado",
        estadoAnterior: desde,
        estadoNuevo: params.hacia,
        usuario: params.usuario ?? "back office",
        comentario: `Instalación: ${ETIQUETA_INSTALACION[desde]} → ${ETIQUETA_INSTALACION[params.hacia]}.`,
      },
    });
    return { desde, hacia: params.hacia };
  });
}

/** El acta de entrega firmada: requisito para marcar ENTREGADA. */
export async function registrarActaEntrega(params: {
  unidadId: string;
  archivoNombre: string;
  quienFirmo: string;
  fechaFirma: Date;
}) {
  const quien = params.quienFirmo.trim();
  if (!quien) throw new ReglaError("Falta quién firmó el acta de entrega.");
  const existente = await prisma.actaEntrega.findUnique({ where: { unidadId: params.unidadId } });
  if (existente) throw new ReglaError("Esta unidad ya tiene su acta de entrega registrada.");

  return prisma.$transaction(async (tx) => {
    const acta = await tx.actaEntrega.create({ data: { ...params, quienFirmo: quien } });
    await tx.evento.create({
      data: {
        entidadTipo: "unidad",
        entidadId: params.unidadId,
        tipo: "acta_entrega_registrada",
        usuario: "back office",
        comentario: `Acta de entrega firmada por ${quien} el ${params.fechaFirma.toLocaleDateString("es-MX")} (${params.archivoNombre}).`,
      },
    });
    return acta;
  });
}
