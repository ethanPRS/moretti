import { EstadoPago, EstadoTransferencia, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { pasarela as pasarelaPorDefecto, type Pasarela } from "../pasarela";
import { ReglaError, mxc } from "./errores";

/**
 * D-34: la plataforma retiene lo cobrado y Ana Cris decide cuándo pagarle a
 * Moretti. Aquí vive el registro: qué está retenido por proyecto y las
 * transferencias autorizadas. La Transfer real en Stripe es de Charly
 * (`pasarela.transferir`).
 *
 * Sólo se transfieren pagos CONFIRMADO. Un pago AJUSTADO (confirmación tardía
 * de un cargo ya revertido) o en disputa queda fuera hasta que una persona
 * lo revise.
 */

type Opciones = { pasarela?: Pasarela };

const RETENIDO = { transferenciaId: null, estado: EstadoPago.CONFIRMADO } satisfies Prisma.PagoWhereInput;

export type Retenido = {
  proyectoId: string;
  proyecto: string;
  cuentaConfigurada: boolean;
  pagos: number;
  bruto: number;
  comision: number;
  neto: number;
};

/** Lo que la plataforma tiene retenido de cada proyecto. */
export async function retenidoPorProyecto(): Promise<Retenido[]> {
  const proyectos = await prisma.proyecto.findMany({ orderBy: { nombre: "asc" } });
  const pagos = await prisma.pago.findMany({
    where: RETENIDO,
    include: { plan: { include: { comprador: { include: { unidad: true } } } } },
  });
  return proyectos.map((p) => {
    const suyos = pagos.filter((x) => x.plan.comprador.unidad.proyectoId === p.id);
    const bruto = suyos.reduce((a, x) => a.add(x.monto), new Prisma.Decimal(0));
    const comision = suyos.reduce((a, x) => a.add(x.montoComision), new Prisma.Decimal(0));
    return {
      proyectoId: p.id,
      proyecto: p.nombre,
      cuentaConfigurada: Boolean(p.stripeConnectedAccountId),
      pagos: suyos.length,
      bruto: bruto.toNumber(),
      comision: comision.toNumber(),
      neto: bruto.sub(comision).toNumber(),
    };
  });
}

/**
 * Ana Cris autoriza pagarle a Moretti todo lo retenido de un proyecto.
 * Primero reserva los pagos (para que dos clics no transfieran dos veces lo
 * mismo), luego llama a la pasarela con una llave fija por transferencia.
 * Si la pasarela falla, la transferencia queda FALLIDA y los pagos vuelven a
 * quedar retenidos.
 */
export async function autorizarTransferencia(
  params: { proyectoId: string; autorizadaPor: string },
  opciones: Opciones = {}
) {
  const quien = params.autorizadaPor.trim();
  if (!quien) throw new ReglaError("Escribe quién autoriza la transferencia: queda en el registro.");
  const proyecto = await prisma.proyecto.findUnique({ where: { id: params.proyectoId } });
  if (!proyecto) throw new ReglaError("No se encontró el proyecto.");
  if (!proyecto.stripeConnectedAccountId) {
    throw new ReglaError("El proyecto no tiene configurada la cuenta de Stripe de Moretti: no hay a dónde transferir.");
  }

  const transferencia = await prisma.$transaction(async (tx) => {
    // Una que quedó EN_PROCESO (la pasarela no contestó) se reintenta tal
    // cual, con la misma llave: así nunca se paga dos veces.
    const enProceso = await tx.transferenciaMoretti.findFirst({
      where: { proyectoId: proyecto.id, estado: EstadoTransferencia.EN_PROCESO },
      include: { pagos: true },
    });
    if (enProceso) return { ...enProceso, referencias: enProceso.pagos.map((x) => x.referenciaStripe ?? x.id) };

    const pagos = await tx.pago.findMany({
      where: { ...RETENIDO, plan: { comprador: { unidad: { proyectoId: proyecto.id } } } },
    });
    if (pagos.length === 0) throw new ReglaError("No hay nada retenido de este proyecto.");
    const bruto = pagos.reduce((a, x) => a.add(x.monto), new Prisma.Decimal(0));
    const comision = pagos.reduce((a, x) => a.add(x.montoComision), new Prisma.Decimal(0));
    const t = await tx.transferenciaMoretti.create({
      data: { proyectoId: proyecto.id, bruto, comision, neto: bruto.sub(comision), autorizadaPor: quien },
    });
    // Reserva condicionada: si otro clic ya los tomó, éste no transfiere nada.
    const { count } = await tx.pago.updateMany({
      where: { id: { in: pagos.map((x) => x.id) }, transferenciaId: null },
      data: { transferenciaId: t.id },
    });
    if (count !== pagos.length) {
      throw new ReglaError("Otra transferencia de este proyecto se autorizó al mismo tiempo. Recarga la página.");
    }
    return { ...t, referencias: pagos.map((x) => x.referenciaStripe ?? x.id) };
  });

  const neto = new Prisma.Decimal(transferencia.neto);
  let resultado;
  try {
    resultado = await (opciones.pasarela ?? pasarelaPorDefecto).transferir({
      transferenciaId: transferencia.id,
      proyectoId: proyecto.id,
      montoCentavos: neto.mul(100).toNumber(),
      referenciasCargos: transferencia.referencias,
    });
  } catch (err) {
    // No se sabe si salió: se deja EN_PROCESO para reintentar con la misma llave.
    await prisma.evento.create({
      data: {
        entidadTipo: "proyecto",
        entidadId: proyecto.id,
        tipo: "transferencia_sin_respuesta",
        usuario: quien,
        comentario: `La pasarela no contestó al transferir ${mxc(neto.toNumber())} a Moretti. La transferencia quedó en proceso; reintentar es seguro (misma llave).`,
      },
    });
    throw new ReglaError("La pasarela no contestó. La transferencia quedó en proceso; vuelve a intentar: no se paga dos veces.", {
      cause: err,
    });
  }

  if (resultado.estado === "fallido") {
    await prisma.$transaction([
      prisma.transferenciaMoretti.update({
        where: { id: transferencia.id },
        data: { estado: EstadoTransferencia.FALLIDA, error: resultado.mensaje },
      }),
      prisma.pago.updateMany({ where: { transferenciaId: transferencia.id }, data: { transferenciaId: null } }),
      prisma.evento.create({
        data: {
          entidadTipo: "proyecto",
          entidadId: proyecto.id,
          tipo: "transferencia_fallida",
          usuario: quien,
          comentario: `No se pudo transferir ${mxc(neto.toNumber())} a Moretti: ${resultado.mensaje}. Los pagos siguen retenidos.`,
        },
      }),
    ]);
    throw new ReglaError(`No se pudo transferir: ${resultado.mensaje}. Los pagos siguen retenidos.`);
  }

  await prisma.$transaction([
    prisma.transferenciaMoretti.update({
      where: { id: transferencia.id },
      data: { estado: EstadoTransferencia.ENVIADA, referencia: resultado.referenciaPasarela },
    }),
    prisma.evento.create({
      data: {
        entidadTipo: "proyecto",
        entidadId: proyecto.id,
        tipo: "transferencia_enviada",
        usuario: quien,
        comentario: `${quien} autorizó pagar a Moretti ${mxc(neto.toNumber())}: ${transferencia.referencias.length} cobros por ${mxc(Number(transferencia.bruto))} menos ${mxc(Number(transferencia.comision))} de comisión (referencia ${resultado.referenciaPasarela}).`,
      },
    }),
  ]);
  return { id: transferencia.id, neto: neto.toNumber(), referencia: resultado.referenciaPasarela };
}
