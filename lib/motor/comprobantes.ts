import { EstadoComprobante, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ReglaError, mx } from "./errores";
import { fechaLimiteComprobante } from "./fiscal";

/**
 * Los pendientes de comprobante fiscal (actividad S, R8). Nacen dentro de la
 * misma transacción que el pago, por cualquiera de los dos caminos de cobro:
 * no puede existir un pago sin su pendiente.
 */

type Tx = Prisma.TransactionClient;

/** Feriados que el SAT agregue a los de ley, «AAAA-MM-DD» separados por coma. */
function feriadosExtra(): string[] {
  return (process.env.FERIADOS_FISCALES ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
}

export async function crearPendienteFiscal(
  tx: Tx,
  pago: { id: string; planId: string; monto: Prisma.Decimal | number; fecha: Date }
) {
  const fechaLimite = fechaLimiteComprobante(pago.fecha, feriadosExtra());
  const comprobante = await tx.comprobanteFiscal.create({
    data: {
      pagoId: pago.id,
      planId: pago.planId,
      monto: pago.monto,
      fechaCobro: pago.fecha,
      fechaLimite,
    },
  });
  await tx.evento.create({
    data: {
      entidadTipo: "plan",
      entidadId: pago.planId,
      tipo: "comprobante_pendiente",
      comentario: `Comprobante fiscal pendiente por ${mx(Number(pago.monto))}: se emite a más tardar el ${fechaLimite.toLocaleDateString("es-MX", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })} (R8).`,
    },
  });
  return comprobante;
}

/** Cierra el pendiente con el folio fiscal (UUID del CFDI). */
export async function marcarComprobanteEmitido(params: { id: string; folioFiscal: string; usuario?: string }) {
  const folio = params.folioFiscal.trim().toUpperCase();
  if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(folio)) {
    throw new ReglaError("El folio fiscal es el UUID del CFDI: 36 caracteres, como 6F9619FF-8B86-D011-B42D-00C04FC964FF.");
  }
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.comprobanteFiscal.updateMany({
      where: { id: params.id, estado: EstadoComprobante.PENDIENTE },
      data: { estado: EstadoComprobante.EMITIDO, folioFiscal: folio, emitidoEn: new Date() },
    });
    if (count === 0) throw new ReglaError("Ese comprobante ya estaba emitido o no existe.");
    const c = await tx.comprobanteFiscal.findUniqueOrThrow({ where: { id: params.id } });
    await tx.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: c.planId,
        tipo: "comprobante_emitido",
        usuario: params.usuario ?? "back office",
        comentario: `Comprobante fiscal emitido por ${mx(Number(c.monto))}, folio ${folio}.`,
      },
    });
    return c;
  });
}
