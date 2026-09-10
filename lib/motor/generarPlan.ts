import { Prisma, EstadoPlan, EstadoExhibicion } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const { Decimal } = Prisma;

export class GenerarPlanError extends Error {}

export async function generarPlan(params: { compradorId: string; paqueteId: string }) {
  const { compradorId, paqueteId } = params;

  const comprador = await prisma.comprador.findUnique({
    where: { id: compradorId },
    include: { unidad: true, planes: { where: { estado: EstadoPlan.Activo } } },
  });
  if (!comprador) throw new GenerarPlanError("Comprador no encontrado.");
  if (comprador.planes.length > 0) {
    throw new GenerarPlanError("El comprador ya tiene un plan activo.");
  }

  const unidad = comprador.unidad;
  const proyecto = await prisma.proyecto.findUnique({ where: { id: unidad.proyectoId } });
  if (!proyecto) throw new GenerarPlanError("Proyecto no encontrado.");

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
    throw new GenerarPlanError("No hay un precio vigente para este prototipo y paquete.");
  }

  const total = new Decimal(precio.monto);
  const porcentajeAnticipo = new Decimal(proyecto.porcentajeAnticipo);
  const anticipo = total.mul(porcentajeAnticipo).toDecimalPlaces(2);
  const restante = total.sub(anticipo);
  const mensualidadBase = restante.div(12).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const sumaOnceMensualidades = mensualidadBase.mul(11);
  const ultimaMensualidad = restante.sub(sumaOnceMensualidades).toDecimalPlaces(2);

  const exhibicionesData = [
    { numero: 0, monto: anticipo, mesesDespues: 0 },
    ...Array.from({ length: 12 }, (_, i) => ({
      numero: i + 1,
      monto: i === 11 ? ultimaMensualidad : mensualidadBase,
      mesesDespues: i + 1,
    })),
  ];

  const plan = await prisma.$transaction(async (tx) => {
    const nuevoPlan = await tx.plan.create({
      data: {
        compradorId,
        paqueteId,
        precioId: precio.id,
        saldo: total,
        estado: EstadoPlan.Activo,
      },
    });

    for (const ex of exhibicionesData) {
      const fecha = new Date(ahora);
      fecha.setMonth(fecha.getMonth() + ex.mesesDespues);
      await tx.exhibicion.create({
        data: {
          planId: nuevoPlan.id,
          numero: ex.numero,
          fechaProgramada: fecha,
          monto: ex.monto,
          estado: EstadoExhibicion.Pendiente,
        },
      });
    }

    await tx.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: nuevoPlan.id,
        tipo: "plan_generado",
        estadoNuevo: EstadoPlan.Activo,
        comentario: `Plan generado con precio congelado ${precio.id} (monto $${total.toFixed(2)}), anticipo ${porcentajeAnticipo.mul(100).toFixed(0)}%.`,
      },
    });

    return nuevoPlan;
  });

  return plan;
}

export async function marcarExhibicionPagada(exhibicionId: string) {
  const exhibicion = await prisma.exhibicion.findUnique({
    where: { id: exhibicionId },
    include: { plan: true },
  });
  if (!exhibicion) throw new GenerarPlanError("Exhibición no encontrada.");
  if (exhibicion.estado === EstadoExhibicion.Pagada) {
    throw new GenerarPlanError("Esta exhibición ya está marcada como pagada.");
  }

  const nuevoSaldo = new Decimal(exhibicion.plan.saldo).sub(new Decimal(exhibicion.monto));
  const planLiquidado = nuevoSaldo.lte(0);

  await prisma.$transaction(async (tx) => {
    await tx.exhibicion.update({
      where: { id: exhibicionId },
      data: { estado: EstadoExhibicion.Pagada, fechaPagada: new Date() },
    });

    await tx.plan.update({
      where: { id: exhibicion.planId },
      data: {
        saldo: nuevoSaldo.lt(0) ? 0 : nuevoSaldo,
        estado: planLiquidado ? EstadoPlan.Liquidado : EstadoPlan.Activo,
      },
    });

    await tx.evento.create({
      data: {
        entidadTipo: "exhibicion",
        entidadId: exhibicionId,
        tipo: "marcada_pagada_manual",
        estadoAnterior: EstadoExhibicion.Pendiente,
        estadoNuevo: EstadoExhibicion.Pagada,
        comentario:
          "Marcada como pagada manualmente en el prototipo (sin pasarela todavía — eso es A.2).",
      },
    });
  });
}
