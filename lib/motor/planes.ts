import {
  Prisma,
  EstadoPlan,
  EstadoExhibicion,
  EstadoFinanciero,
  EstadoIntentoCobro,
  EstadoPago,
} from "@prisma/client";
import { prisma } from "../prisma";
import { calcularExhibiciones } from "./calculo";

const { Decimal } = Prisma;

/// Error de regla de negocio. El mensaje explica QUÉ falta, no solo que no se permite.
export class ReglaError extends Error {}

export type IntentoCobroPreparado = {
  id: string;
  planId: string;
  exhibicionId: string;
  monto: Prisma.Decimal;
  porcentajeComision: Prisma.Decimal;
  montoComision: Prisma.Decimal;
  idempotencyKey: string;
  stripeAccountId: string;
};

function fechaMasMeses(base: Date, meses: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + meses);
  return d;
}

/**
 * Genera el plan como COTIZACIÓN. El precio todavía NO se congela:
 * R2 dice que se congela con el anticipo, no con la cotización.
 */
export async function generarPlan(params: { compradorId: string; paqueteId: string }) {
  const { compradorId, paqueteId } = params;

  const comprador = await prisma.comprador.findUnique({
    where: { id: compradorId },
    include: {
      unidad: { include: { proyecto: true } },
      planes: { where: { estado: { in: [EstadoPlan.COTIZADO, EstadoPlan.ACTIVO] } } },
    },
  });
  if (!comprador) throw new ReglaError("No se encontró al comprador.");
  if (comprador.planes.length > 0) {
    throw new ReglaError("Este comprador ya tiene un plan abierto.");
  }

  const { unidad } = comprador;
  const ahora = new Date();

  const precio = await prisma.precio.findFirst({
    where: {
      prototipoId: unidad.prototipoId,
      paqueteId,
      vigenteDesde: { lte: ahora },
      OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }],
    },
    orderBy: { vigenteDesde: "desc" },
  });
  if (!precio) {
    throw new ReglaError(
      "No hay precio vigente para este prototipo con ese paquete. Cárgalo en el proyecto antes de cotizar."
    );
  }

  const monto = new Decimal(precio.monto);
  const exhibiciones = calcularExhibiciones(monto, new Decimal(unidad.proyecto.porcentajeAnticipo));

  return prisma.$transaction(async (tx) => {
    const plan = await tx.plan.create({
      data: {
        compradorId,
        paqueteId,
        precioId: precio.id,
        montoCongelado: monto,
        saldo: monto,
        estado: EstadoPlan.COTIZADO,
        exhibiciones: {
          create: exhibiciones.map((e) => ({
            numero: e.numero,
            monto: e.monto,
            fechaProgramada: fechaMasMeses(ahora, e.numero),
          })),
        },
      },
    });

    await tx.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: plan.id,
        tipo: "plan_cotizado",
        estadoNuevo: EstadoPlan.COTIZADO,
        comentario: `Cotización por $${monto.toFixed(2)}. El precio se congela cuando se cobre el anticipo.`,
      },
    });

    return plan;
  });
}

/**
 * Cobra el anticipo. Aquí se aplican las reglas duras:
 * R1 — sin contrato firmado no se cobra.
 * R2 — al cobrarlo, el precio queda congelado.
 * Regla cruzada — APARTADO requiere contrato firmado Y anticipo cobrado.
 */
export async function cobrarAnticipo(planId: string) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: {
      comprador: { include: { unidad: { include: { proyecto: true, contrato: true } } } },
      exhibiciones: { where: { numero: 0 } },
    },
  });
  if (!plan) throw new ReglaError("No se encontró el plan.");

  const unidad = plan.comprador.unidad;

  if (!unidad.contrato) {
    throw new ReglaError(
      "No se puede cobrar: falta el contrato firmado con Moretti. Regístralo en el expediente de la unidad antes de cobrar el anticipo."
    );
  }
  if (plan.fechaCongelamiento) {
    throw new ReglaError("El anticipo de este plan ya se cobró.");
  }

  const anticipo = plan.exhibiciones[0];
  const ahora = new Date();
  const porcentajeComision = new Decimal(unidad.proyecto.porcentajeComision);
  const montoComision = new Decimal(anticipo.monto)
    .mul(porcentajeComision)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  await prisma.$transaction(async (tx) => {
    await tx.exhibicion.update({
      where: { id: anticipo.id },
      data: { estado: EstadoExhibicion.PAGADA },
    });

    await tx.pago.create({
      data: {
        planId: plan.id,
        exhibicionId: anticipo.id,
        monto: anticipo.monto,
        fecha: ahora,
        porcentajeComision,
        montoComision,
      },
    });

    await tx.plan.update({
      where: { id: plan.id },
      data: {
        estado: EstadoPlan.ACTIVO,
        fechaCongelamiento: ahora,
        saldo: new Decimal(plan.saldo).sub(new Decimal(anticipo.monto)),
      },
    });

    await tx.unidad.update({
      where: { id: unidad.id },
      data: { estadoFinanciero: EstadoFinanciero.APARTADO },
    });

    await tx.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: plan.id,
        tipo: "anticipo_cobrado",
        estadoAnterior: EstadoFinanciero.COTIZADO,
        estadoNuevo: EstadoFinanciero.APARTADO,
        comentario: `Anticipo de $${new Decimal(anticipo.monto).toFixed(2)} cobrado. Precio congelado en $${new Decimal(plan.montoCongelado).toFixed(2)}. Comisión del canal: $${montoComision.toFixed(2)}.`,
      },
    });
  });
}

/** Cobra una mensualidad. Exige que el anticipo ya se haya cobrado. */
export async function cobrarExhibicion(exhibicionId: string) {
  const exhibicion = await prisma.exhibicion.findUnique({
    where: { id: exhibicionId },
    include: {
      plan: {
        include: {
          comprador: { include: { unidad: { include: { proyecto: true } } } },
        },
      },
    },
  });
  if (!exhibicion) throw new ReglaError("No se encontró la exhibición.");
  if (exhibicion.numero === 0) return cobrarAnticipo(exhibicion.planId);

  const { plan } = exhibicion;
  if (!plan.fechaCongelamiento) {
    throw new ReglaError(
      "No se puede cobrar una mensualidad antes del anticipo. Cobra primero el anticipo para apartar la unidad."
    );
  }
  if (exhibicion.estado === EstadoExhibicion.PAGADA) {
    throw new ReglaError("Esta exhibición ya está pagada.");
  }

  const unidad = plan.comprador.unidad;
  const porcentajeComision = new Decimal(unidad.proyecto.porcentajeComision);
  const montoComision = new Decimal(exhibicion.monto)
    .mul(porcentajeComision)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const nuevoSaldo = new Decimal(plan.saldo).sub(new Decimal(exhibicion.monto));
  const liquidado = nuevoSaldo.lte(0);

  await prisma.$transaction(async (tx) => {
    await tx.exhibicion.update({
      where: { id: exhibicion.id },
      data: { estado: EstadoExhibicion.PAGADA },
    });

    await tx.pago.create({
      data: {
        planId: plan.id,
        exhibicionId: exhibicion.id,
        monto: exhibicion.monto,
        porcentajeComision,
        montoComision,
      },
    });

    await tx.plan.update({
      where: { id: plan.id },
      data: {
        saldo: nuevoSaldo.lt(0) ? 0 : nuevoSaldo,
        estado: liquidado ? EstadoPlan.LIQUIDADO : EstadoPlan.ACTIVO,
      },
    });

    await tx.unidad.update({
      where: { id: unidad.id },
      data: {
        estadoFinanciero: liquidado
          ? EstadoFinanciero.LIQUIDADO
          : EstadoFinanciero.AL_CORRIENTE,
      },
    });

    await tx.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: plan.id,
        tipo: "exhibicion_cobrada",
        estadoNuevo: liquidado ? EstadoFinanciero.LIQUIDADO : EstadoFinanciero.AL_CORRIENTE,
        comentario: `Exhibición ${exhibicion.numero} de $${new Decimal(exhibicion.monto).toFixed(2)} cobrada. Comisión del canal: $${montoComision.toFixed(2)}.`,
      },
    });
  });
}

/**
 * Prepara un cobro Stripe, pero no aplica dinero al plan. El webhook es el
 * único camino que convierte este intento en Pago y actualiza el saldo.
 */
export async function prepararIntentoCobro(exhibicionId: string) {
  const exhibicion = await prisma.exhibicion.findUnique({
    where: { id: exhibicionId },
    include: {
      plan: {
        include: {
          comprador: { include: { unidad: { include: { proyecto: true, contrato: true } } } },
        },
      },
    },
  });
  if (!exhibicion) throw new ReglaError("No se encontró la exhibición.");

  const { plan } = exhibicion;
  const unidad = plan.comprador.unidad;
  const stripeAccountId = unidad.proyecto.stripeConnectedAccountId;

  if (!stripeAccountId) {
    throw new ReglaError("El proyecto no tiene configurada la cuenta Stripe de Moretti.");
  }
  if (!unidad.contrato) {
    throw new ReglaError("No se puede cobrar: falta el contrato firmado con Moretti.");
  }
  if (exhibicion.numero > 0 && !plan.fechaCongelamiento) {
    throw new ReglaError("No se puede cobrar una mensualidad antes del anticipo.");
  }
  if (exhibicion.estado === EstadoExhibicion.PAGADA) {
    throw new ReglaError("Esta exhibición ya está pagada.");
  }

  const porcentajeComision = new Decimal(unidad.proyecto.porcentajeComision);
  const monto = new Decimal(exhibicion.monto);
  const montoComision = monto.mul(porcentajeComision).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const idempotencyKey = `exhibicion_${exhibicion.id}`;
  const existing = await prisma.intentoCobro.findUnique({ where: { idempotencyKey } });

  if (existing) {
    if (existing.estado === EstadoIntentoCobro.CONFIRMADO) {
      throw new ReglaError("Esta exhibición ya tiene un cobro confirmado.");
    }
    return {
      id: existing.id,
      planId: existing.planId,
      exhibicionId: existing.exhibicionId,
      monto: new Decimal(existing.monto),
      porcentajeComision: new Decimal(existing.porcentajeComision),
      montoComision: new Decimal(existing.montoComision),
      idempotencyKey: existing.idempotencyKey,
      stripeAccountId: existing.stripeAccountId,
      stripePaymentIntentId: existing.stripePaymentIntentId,
    };
  }

  return prisma.intentoCobro.create({
    data: {
      exhibicionId: exhibicion.id,
      planId: plan.id,
      idempotencyKey,
      stripeAccountId,
      monto,
      porcentajeComision,
      montoComision,
    },
  });
}

/** Aplica un PaymentIntent confirmado exactamente una vez. */
export async function confirmarCobroStripe(params: {
  paymentIntentId: string;
  stripeAccountId: string;
  stripeChargeId?: string;
}) {
  const intento = await prisma.intentoCobro.findUnique({
    where: { stripePaymentIntentId: params.paymentIntentId },
    include: { exhibicion: true },
  });
  if (!intento) throw new ReglaError("No se encontró el intento de cobro para este PaymentIntent.");
  if (intento.stripeAccountId !== params.stripeAccountId) {
    throw new ReglaError("La cuenta Stripe del evento no coincide con el intento.");
  }
  if (intento.estado === EstadoIntentoCobro.CONFIRMADO) return;

  await prisma.$transaction(async (tx) => {
    const locked = await tx.intentoCobro.findUnique({
      where: { id: intento.id },
      include: { exhibicion: true },
    });
    if (!locked || locked.estado === EstadoIntentoCobro.CONFIRMADO) return;

    const plan = await tx.plan.findUnique({
      where: { id: locked.planId },
      include: { comprador: { include: { unidad: true } } },
    });
    if (!plan) throw new ReglaError("No se encontró el plan del intento de cobro.");

    const nuevoSaldo = new Decimal(plan.saldo).sub(new Decimal(locked.monto));
    const esAnticipo = locked.exhibicion.numero === 0;
    const liquidado = nuevoSaldo.lte(0);

    await tx.pago.create({
      data: {
        planId: locked.planId,
        exhibicionId: locked.exhibicionId,
        monto: locked.monto,
        referenciaStripe: params.paymentIntentId,
        stripePaymentIntentId: params.paymentIntentId,
        stripeChargeId: params.stripeChargeId,
        stripeAccountId: params.stripeAccountId,
        estado: EstadoPago.CONFIRMADO,
        porcentajeComision: locked.porcentajeComision,
        montoComision: locked.montoComision,
      },
    });
    await tx.exhibicion.update({
      where: { id: locked.exhibicionId },
      data: { estado: EstadoExhibicion.PAGADA },
    });
    await tx.plan.update({
      where: { id: locked.planId },
      data: {
        estado: esAnticipo ? EstadoPlan.ACTIVO : liquidado ? EstadoPlan.LIQUIDADO : EstadoPlan.ACTIVO,
        fechaCongelamiento: esAnticipo ? new Date() : undefined,
        saldo: nuevoSaldo.lt(0) ? 0 : nuevoSaldo,
      },
    });
    await tx.unidad.update({
      where: { id: plan.comprador.unidad.id },
      data: {
        estadoFinanciero: esAnticipo
          ? EstadoFinanciero.APARTADO
          : liquidado
            ? EstadoFinanciero.LIQUIDADO
            : EstadoFinanciero.AL_CORRIENTE,
      },
    });
    await tx.intentoCobro.update({
      where: { id: locked.id },
      data: { estado: EstadoIntentoCobro.CONFIRMADO },
    });
    await tx.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: plan.id,
        tipo: esAnticipo ? "anticipo_cobrado" : "exhibicion_cobrada",
        estadoNuevo: esAnticipo
          ? EstadoFinanciero.APARTADO
          : liquidado
            ? EstadoFinanciero.LIQUIDADO
            : EstadoFinanciero.AL_CORRIENTE,
        comentario: `Stripe confirmó ${esAnticipo ? "el anticipo" : `la exhibición ${locked.exhibicion.numero}`} por $${new Decimal(locked.monto).toFixed(2)}.`,
      },
    });
  });
}

export async function marcarIntentoCobroFallido(params: {
  paymentIntentId: string;
  stripeAccountId: string;
  codigo?: string;
  mensaje?: string;
}) {
  const intento = await prisma.intentoCobro.findUnique({
    where: { stripePaymentIntentId: params.paymentIntentId },
  });
  if (!intento || intento.stripeAccountId !== params.stripeAccountId) return;
  if (intento.estado === EstadoIntentoCobro.CONFIRMADO) return;

  await prisma.intentoCobro.update({
    where: { id: intento.id },
    data: {
      estado: EstadoIntentoCobro.FALLIDO,
      codigoFallo: params.codigo,
      mensajeFallo: params.mensaje,
    },
  });
}

export async function registrarContrato(params: {
  unidadId: string;
  archivoNombre: string;
  quienFirmo: string;
  fechaFirma: Date;
}) {
  const existente = await prisma.contrato.findUnique({
    where: { unidadId: params.unidadId },
  });
  if (existente) {
    throw new ReglaError("Esta unidad ya tiene un contrato registrado.");
  }

  const contrato = await prisma.contrato.create({ data: params });

  await prisma.evento.create({
    data: {
      entidadTipo: "unidad",
      entidadId: params.unidadId,
      tipo: "contrato_registrado",
      comentario: `Contrato firmado por ${params.quienFirmo} el ${params.fechaFirma.toLocaleDateString("es-MX")}.`,
    },
  });

  return contrato;
}
