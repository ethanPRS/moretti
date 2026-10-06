import { EstadoExhibicion, EstadoFinanciero, EstadoPlan, Prisma, TipoExhibicion } from "@prisma/client";
import { prisma } from "../prisma";
import type { Pasarela } from "../pasarela";
import { ReglaError, mx } from "./errores";
import { cobrarExhibicion, type ResultadoCobroMotor } from "./planes";
import {
  aCentavos,
  calcularAdelanto,
  calcularLiquidacion,
  type ExhibicionViva,
  type Recalculo,
} from "./recalculo";

/**
 * Adelanto y liquidación anticipada con versionado del plan (actividad R).
 *
 * R4: recalcular versiona, no sobrescribe. Cada recálculo:
 *   1. guarda la foto del calendario vigente si todavía no la tiene;
 *   2. marca como REEMPLAZADA (o CANCELADA, en la liquidación) lo que sustituye;
 *   3. crea las exhibiciones nuevas con la versión siguiente;
 *   4. guarda la foto del calendario nuevo con su motivo.
 * Lo cobrado no se toca (R3) y lo vivo siempre suma el precio congelado (R7).
 *
 * Después se cobra el adelanto o la liquidación por el camino normal
 * (pasarela, llave de idempotencia, comisión, bitácora). Si el banco lo
 * rechaza, el comprador no debe ese dinero: se crea otra versión que
 * restituye el calendario anterior. Nada se borra.
 */

type Tx = Prisma.TransactionClient;
type Opciones = { pasarela?: Pasarela; usuario?: string };

const VIVAS = [EstadoExhibicion.PENDIENTE, EstadoExhibicion.VENCIDA];
const VIGENTES = [EstadoExhibicion.PENDIENTE, EstadoExhibicion.VENCIDA, EstadoExhibicion.PAGADA];

export type FilaCalendario = {
  numero: number;
  tipo: TipoExhibicion;
  monto: string;
  fechaProgramada: string;
  estado: EstadoExhibicion;
};

async function leerPlan(db: Tx | typeof prisma, planId: string) {
  const plan = await db.plan.findUnique({
    where: { id: planId },
    include: {
      comprador: { include: { unidad: true } },
      exhibiciones: { where: { estado: { in: VIGENTES } }, orderBy: [{ numero: "asc" }, { tipo: "asc" }] },
    },
  });
  if (!plan) throw new ReglaError("No se encontró el plan.");
  return plan;
}

type PlanLeido = Awaited<ReturnType<typeof leerPlan>>;

/** Lo que se tiene que cumplir para adelantar o liquidar. Cada error dice qué falta. */
function asegurarRecalculable(plan: PlanLeido, accion: string) {
  if (plan.estado === EstadoPlan.CANCELADO) throw new ReglaError(`El plan está cancelado: no procede ${accion}.`);
  if (plan.estado === EstadoPlan.LIQUIDADO) throw new ReglaError(`El plan ya está liquidado: no procede ${accion}.`);
  if (!plan.fechaCongelamiento) {
    throw new ReglaError(`No procede ${accion} antes del anticipo: primero se cobra el anticipo y se congela el precio.`);
  }
  if (plan.comprador.unidad.estadoFinanciero === EstadoFinanciero.CANCELADO) {
    throw new ReglaError(`La unidad está cancelada: no procede ${accion}.`);
  }
  const enCurso = plan.exhibiciones.find(
    (e) =>
      (e.tipo === TipoExhibicion.ADELANTO || e.tipo === TipoExhibicion.LIQUIDACION) &&
      e.estado !== EstadoExhibicion.PAGADA
  );
  if (enCurso) {
    throw new ReglaError(
      `Ya hay ${enCurso.tipo === TipoExhibicion.ADELANTO ? "un adelanto" : "una liquidación"} de ${mx(Number(enCurso.monto))} esperando confirmación del banco. Espera a que se confirme o se rechace antes de hacer otro recálculo.`
    );
  }
}

function vivasDe(plan: PlanLeido): ExhibicionViva[] {
  return plan.exhibiciones
    .filter((e) => VIVAS.includes(e.estado as (typeof VIVAS)[number]))
    .map((e) => ({ id: e.id, numero: e.numero, monto: aCentavos(e.monto.toFixed(2)), fechaProgramada: e.fechaProgramada }));
}

function fotoDe(exhibiciones: PlanLeido["exhibiciones"]): FilaCalendario[] {
  return exhibiciones.map((e) => ({
    numero: e.numero,
    tipo: e.tipo,
    monto: e.monto.toFixed(2),
    fechaProgramada: e.fechaProgramada.toISOString(),
    estado: e.estado,
  }));
}

const pesos = (centavos: number) => new Prisma.Decimal(centavos).div(100);

export type VistaPrevia = {
  saldoAntes: number;
  cobro: number;
  saldoDespues: number;
  exhibicionesAntes: number;
  exhibicionesDespues: number;
  cubiertas: { numero: number; monto: number }[];
  quedan: { numero: number; monto: number; fechaProgramada: string; cambio: "igual" | "reducida" }[];
};

function vistaDe(vivas: ExhibicionViva[], r: Recalculo): VistaPrevia {
  const saldoAntes = vivas.reduce((a, e) => a + e.monto, 0);
  return {
    saldoAntes: saldoAntes / 100,
    cobro: r.cobro.monto / 100,
    saldoDespues: (saldoAntes - r.cobro.monto) / 100,
    exhibicionesAntes: vivas.length,
    exhibicionesDespues: r.quedan.length,
    cubiertas: r.cubiertas.map((e) => ({ numero: e.numero, monto: e.monto / 100 })),
    quedan: r.quedan.map((q) => ({
      numero: q.numero,
      monto: q.monto / 100,
      fechaProgramada: q.fechaProgramada.toISOString(),
      cambio: q.cambio,
    })),
  };
}

/** Cómo quedaría el plan con un adelanto. No cambia nada. */
export async function previsualizarAdelanto(planId: string, monto: number | string): Promise<VistaPrevia> {
  const plan = await leerPlan(prisma, planId);
  asegurarRecalculable(plan, "un adelanto");
  const vivas = vivasDe(plan);
  return vistaDe(vivas, calcularAdelanto(vivas, aCentavos(monto)));
}

/** Cómo quedaría el plan con la liquidación anticipada. No cambia nada. */
export async function previsualizarLiquidacion(planId: string): Promise<VistaPrevia> {
  const plan = await leerPlan(prisma, planId);
  asegurarRecalculable(plan, "la liquidación anticipada");
  const vivas = vivasDe(plan);
  return vistaDe(vivas, calcularLiquidacion(vivas));
}

export type ResultadoRecalculo = ResultadoCobroMotor & { version: number };

export async function ejecutarAdelanto(
  params: { planId: string; monto: number | string },
  opciones: Opciones = {}
): Promise<ResultadoRecalculo> {
  const centavos = aCentavos(params.monto);
  return recalcularYCobrar(params.planId, TipoExhibicion.ADELANTO, opciones, (vivas) => calcularAdelanto(vivas, centavos));
}

export async function ejecutarLiquidacion(params: { planId: string }, opciones: Opciones = {}): Promise<ResultadoRecalculo> {
  return recalcularYCobrar(params.planId, TipoExhibicion.LIQUIDACION, opciones, calcularLiquidacion);
}

async function recalcularYCobrar(
  planId: string,
  tipo: typeof TipoExhibicion.ADELANTO | typeof TipoExhibicion.LIQUIDACION,
  opciones: Opciones,
  calcular: (vivas: ExhibicionViva[]) => Recalculo
): Promise<ResultadoRecalculo> {
  const usuario = opciones.usuario ?? "back office";
  const accion = tipo === TipoExhibicion.ADELANTO ? "un adelanto" : "la liquidación anticipada";

  const { cobroId, version, recalculo } = await prisma.$transaction(async (tx) => {
    const plan = await leerPlan(tx, planId);
    asegurarRecalculable(plan, accion);
    const recalculo = calcular(vivasDe(plan));
    const motivo =
      tipo === TipoExhibicion.ADELANTO
        ? `Adelanto de ${mx(recalculo.cobro.monto / 100)}: ${describirAdelanto(recalculo)}`
        : `Liquidación anticipada de ${mx(recalculo.cobro.monto / 100)}, sin descuento: se cancelan las ${recalculo.cubiertas.length} exhibiciones pendientes.`;

    const retiro = tipo === TipoExhibicion.LIQUIDACION ? EstadoExhibicion.CANCELADA : EstadoExhibicion.REEMPLAZADA;
    const nuevas = [
      ...(recalculo.ajustada
        ? [
            {
              numero: recalculo.ajustada.original.numero,
              tipo: TipoExhibicion.MENSUALIDAD,
              monto: pesos(recalculo.ajustada.montoNuevo),
              fechaProgramada: recalculo.ajustada.original.fechaProgramada,
            },
          ]
        : []),
      { numero: recalculo.cobro.numero, tipo, monto: pesos(recalculo.cobro.monto), fechaProgramada: new Date() },
    ];
    const retirar = [...recalculo.cubiertas, ...(recalculo.ajustada ? [recalculo.ajustada.original] : [])].map((e) => e.id);

    const { version, creadas } = await nuevaVersion(tx, plan, { retirar, retiro, nuevas, motivo, usuario });
    const cobro = creadas.find((e) => e.tipo === tipo)!;
    return { cobroId: cobro.id, version, recalculo };
  });

  const resultado = await cobrarExhibicion(cobroId, { pasarela: opciones.pasarela });
  if (resultado.estado !== "rechazado") return { ...resultado, version };

  // El banco lo rechazó: el comprador no debe ese dinero. Otra versión
  // restituye el calendario anterior; la rechazada queda como historia.
  const restituida = await prisma.$transaction(async (tx) => {
    const plan = await leerPlan(tx, planId);
    const enVersion = await tx.exhibicion.findMany({
      where: { planId, version, estado: { in: VIVAS } },
    });
    const originales = [
      ...recalculo.cubiertas,
      ...(recalculo.ajustada ? [recalculo.ajustada.original] : []),
    ];
    const anteriores = await tx.exhibicion.findMany({ where: { id: { in: originales.map((e) => e.id) } } });
    const motivo = `Se revirtió ${tipo === TipoExhibicion.ADELANTO ? "el adelanto" : "la liquidación"} de ${mx(recalculo.cobro.monto / 100)} porque el banco lo rechazó (${resultado.codigo}). El calendario vuelve a quedar como en la versión ${version - 1}.`;
    return nuevaVersion(tx, plan, {
      retirar: enVersion.map((e) => e.id),
      retiro: EstadoExhibicion.CANCELADA,
      nuevas: anteriores.map((e) => ({
        numero: e.numero,
        tipo: e.tipo,
        monto: e.monto,
        fechaProgramada: e.fechaProgramada,
      })),
      motivo,
      usuario: "sistema",
    });
  });
  return { ...resultado, version: restituida.version };
}

function describirAdelanto(r: Recalculo): string {
  const partes: string[] = [];
  if (r.cubiertas.length > 0) {
    partes.push(
      `paga por adelantado ${r.cubiertas.length === 1 ? "la exhibición" : "las exhibiciones"} ${r.cubiertas.map((e) => e.numero).join(", ")}`
    );
  }
  if (r.ajustada) {
    partes.push(
      `abona ${mx((r.ajustada.original.monto - r.ajustada.montoNuevo) / 100)} a la ${r.ajustada.original.numero}, que baja a ${mx(r.ajustada.montoNuevo / 100)}`
    );
  }
  return `${partes.join(" y ")}. Quedan ${r.quedan.length} exhibiciones; el monto de las demás no cambia.`;
}

/**
 * Crea la versión siguiente del plan. Condicionada a la versión leída: si
 * otro recálculo entró en medio, éste no se aplica. Al final verifica R7.
 */
async function nuevaVersion(
  tx: Tx,
  plan: PlanLeido,
  p: {
    retirar: string[];
    retiro: typeof EstadoExhibicion.REEMPLAZADA | typeof EstadoExhibicion.CANCELADA;
    nuevas: { numero: number; tipo: TipoExhibicion; monto: Prisma.Decimal; fechaProgramada: Date }[];
    motivo: string;
    usuario: string;
  }
) {
  const actual = plan.version;
  const siguiente = actual + 1;

  // La foto de la versión vigente, si nadie la ha tomado (los planes nacen sin ella).
  const yaTieneFoto = await tx.versionPlan.findUnique({ where: { planId_version: { planId: plan.id, version: actual } } });
  if (!yaTieneFoto) {
    await tx.versionPlan.create({
      data: {
        planId: plan.id,
        version: actual,
        motivo: actual === 1 ? "Versión original" : `Versión ${actual}`,
        saldo: plan.saldo,
        calendario: fotoDe(plan.exhibiciones),
      },
    });
  }

  const { count: subio } = await tx.plan.updateMany({
    where: { id: plan.id, version: actual },
    data: { version: siguiente },
  });
  if (subio === 0) throw new ReglaError("El plan cambió mientras tanto. Recarga la página y vuelve a intentar.");

  const { count: retiradas } = await tx.exhibicion.updateMany({
    where: { id: { in: p.retirar }, estado: { in: VIVAS } },
    data: { estado: p.retiro },
  });
  if (retiradas !== p.retirar.length) {
    throw new ReglaError("Una exhibición cambió mientras tanto (¿se cobró?). Recarga la página y vuelve a intentar.");
  }

  const creadas = [];
  for (const n of p.nuevas) {
    creadas.push(await tx.exhibicion.create({ data: { planId: plan.id, version: siguiente, ...n } }));
  }

  const despues = await leerPlan(tx, plan.id);
  // R7: lo vigente (cobrado + por cobrar) suma el precio congelado, al peso.
  const suma = despues.exhibiciones.reduce((a, e) => a.add(e.monto), new Prisma.Decimal(0));
  if (!suma.eq(despues.montoCongelado)) {
    throw new Error(
      `R7: el calendario de la versión ${siguiente} suma ${suma.toFixed(2)} y el plan ${despues.montoCongelado.toFixed(2)}. No se aplicó.`
    );
  }

  await tx.versionPlan.create({
    data: {
      planId: plan.id,
      version: siguiente,
      motivo: p.motivo,
      saldo: despues.saldo,
      calendario: fotoDe(despues.exhibiciones),
      usuario: p.usuario,
    },
  });
  await tx.evento.create({
    data: {
      entidadTipo: "plan",
      entidadId: plan.id,
      tipo: "plan_recalculado",
      usuario: p.usuario,
      comentario: `Versión ${siguiente} del plan. ${p.motivo} La versión ${actual} sigue consultable.`,
    },
  });
  return { version: siguiente, creadas };
}

/** Las versiones del plan, de la más nueva a la más vieja, con su calendario. */
export async function versionesDelPlan(planId: string) {
  const versiones = await prisma.versionPlan.findMany({ where: { planId }, orderBy: { version: "desc" } });
  return versiones.map((v) => ({ ...v, calendario: v.calendario as FilaCalendario[] }));
}
