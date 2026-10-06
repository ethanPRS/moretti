import { EstadoExhibicion, EstadoFinanciero, ModalidadPlan, OrigenRenglon, Prisma, TipoExhibicion } from "@prisma/client";
import { prisma } from "../prisma";
import type { Pasarela } from "../pasarela";
import { cargarCatalogo } from "./catalogo";
import { ReglaError, mx } from "./errores";
import { bloqueoPorLevantamiento } from "./operacion";
import { cobrarExhibicion } from "./planes";
import { calcularUpgrade, renglonesDelUpgrade } from "./recalculo";
import {
  asegurarRecalculable,
  leerPlan,
  nuevaVersion,
  pesos,
  vivasDe,
  VIVAS,
  type PlanLeido,
  type ResultadoRecalculo,
} from "./versiones";

/**
 * Upgrade de paquete (actividad T): Ethan versiona, Charly cobra.
 *
 * Conserva el precio congelado original y le suma la diferencia entre el
 * paquete nuevo y el viejo, los dos a su precio de hoy. Se cobra hoy el % de
 * anticipo de la diferencia; el resto se reparte entre las exhibiciones que
 * quedan, sin alargar el plan. Lo nuevo entra como renglones nuevos; los que
 * ya estaban no se tocan (R2). Bloqueado con el levantamiento hecho (R6).
 * Si el banco rechaza el cobro, todo se restituye con otra versión.
 */

type Tx = Prisma.TransactionClient;
type Opciones = { pasarela?: Pasarela; usuario?: string };

export type VistaUpgrade = {
  paqueteActual: string;
  paqueteNuevo: string;
  totalAntes: number;
  diferencia: number;
  totalDespues: number;
  cobroHoy: number;
  exhibiciones: number;
  mensualidadAntes: number;
  mensualidadDespues: number;
  partidasNuevas: { nombre: string; cantidad: number; importe: number }[];
  quedan: { numero: number; monto: number; fechaProgramada: string }[];
};

async function prepararUpgrade(db: Tx | typeof prisma, planId: string, paqueteNuevoId: string) {
  const plan = await leerPlan(db, planId);
  asegurarRecalculable(plan, "un upgrade");
  const unidad = plan.comprador.unidad;
  const bloqueo = bloqueoPorLevantamiento(unidad.estadoOperativo, "el paquete");
  if (bloqueo) throw new ReglaError(bloqueo);
  if (unidad.estadoFinanciero === EstadoFinanciero.SUSPENDIDO) {
    throw new ReglaError("La unidad está suspendida: primero tiene que ponerse al corriente para cambiar de paquete.");
  }
  if (plan.modalidad !== ModalidadPlan.PAQUETE) {
    throw new ReglaError(
      "El upgrade es de un paquete cerrado a otro mayor. Este plan se armó partida por partida; un cambio así se cotiza aparte."
    );
  }

  const catalogo = await cargarCatalogo(unidad.prototipoId);
  const viejo = catalogo.prototipo.paquetes.find((p) => p.id === plan.paqueteId);
  const nuevo = catalogo.prototipo.paquetes.find((p) => p.id === paqueteNuevoId);
  if (!viejo) throw new ReglaError("El paquete actual ya no tiene precio vigente en este prototipo: revísalo con comercial.");
  if (!nuevo) throw new ReglaError("Ese paquete no tiene precio vigente en este prototipo.");
  if (nuevo.nivel <= viejo.nivel) {
    throw new ReglaError(`${nuevo.nombre} no es mayor que ${viejo.nombre}: el upgrade sólo sube de paquete.`);
  }

  const renglones = await db.renglonPlan.findMany({ where: { planId }, include: { partida: true } });
  const agregadaQueYaViene = renglones.find((r) => r.origen === OrigenRenglon.AGREGADA && r.partida.clave in nuevo.contenido);
  if (agregadaQueYaViene) {
    throw new ReglaError(
      `«${agregadaQueYaViene.partida.nombre}» ya se compró aparte y ${nuevo.nombre} la incluye: se cobraría dos veces. Este upgrade se cotiza con comercial.`
    );
  }

  const diferencia = nuevo.precio - viejo.precio;
  const lista = Object.fromEntries(catalogo.prototipo.partidas.map((p) => [p.clave, p.precioLista]));
  const nuevos = renglonesDelUpgrade(viejo.contenido, nuevo.contenido, lista, diferencia);
  const vivas = vivasDe(plan);
  const calculo = calcularUpgrade(vivas, diferencia * 100, catalogo.proyecto.anticipoBP);
  const partidaPorClave = new Map(catalogo.prototipo.partidas.map((p) => [p.clave, p]));
  return { plan, viejo, nuevo, diferencia, nuevos, vivas, calculo, partidaPorClave };
}

/** Cómo quedaría el plan con el upgrade. No cambia nada. */
export async function previsualizarUpgrade(planId: string, paqueteNuevoId: string): Promise<VistaUpgrade> {
  const u = await prepararUpgrade(prisma, planId, paqueteNuevoId);
  const total = Number(u.plan.montoCongelado);
  return {
    paqueteActual: u.viejo.nombre,
    paqueteNuevo: u.nuevo.nombre,
    totalAntes: total,
    diferencia: u.diferencia,
    totalDespues: total + u.diferencia,
    cobroHoy: u.calculo.cobroHoy / 100,
    exhibiciones: u.vivas.length,
    mensualidadAntes: (u.vivas[0]?.monto ?? 0) / 100,
    mensualidadDespues: (u.calculo.quedan[0]?.monto ?? 0) / 100,
    partidasNuevas: u.nuevos.map((r) => ({
      nombre: u.partidaPorClave.get(r.clave)!.nombre,
      cantidad: r.cantidad,
      importe: r.importe,
    })),
    quedan: u.calculo.quedan.map((q) => ({
      numero: q.numero,
      monto: q.monto / 100,
      fechaProgramada: q.fechaProgramada.toISOString(),
    })),
  };
}

export async function ejecutarUpgrade(
  params: { planId: string; paqueteId: string },
  opciones: Opciones = {}
): Promise<ResultadoRecalculo> {
  const usuario = opciones.usuario ?? "back office";

  const aplicado = await prisma.$transaction(async (tx) => {
    const u = await prepararUpgrade(tx, params.planId, params.paqueteId);
    const anterior = {
      paqueteId: u.plan.paqueteId,
      precioId: u.plan.precioId,
      montoCongelado: u.plan.montoCongelado,
      saldo: u.plan.saldo,
    };

    // El precio congelado se conserva: sólo se le suma la diferencia.
    await tx.plan.update({
      where: { id: u.plan.id },
      data: {
        paqueteId: u.nuevo.id,
        precioId: u.nuevo.precioId,
        montoCongelado: { increment: u.diferencia },
        saldo: { increment: u.diferencia },
      },
    });
    const creados = [];
    for (const r of u.nuevos) {
      creados.push(
        await tx.renglonPlan.create({
          data: {
            planId: u.plan.id,
            partidaId: u.partidaPorClave.get(r.clave)!.id,
            cantidad: r.cantidad,
            precioLista: r.precioLista,
            precioCongelado: r.importe,
            origen: OrigenRenglon.PAQUETE,
          },
        })
      );
    }

    const primera = u.calculo.quedan[0].numero;
    const motivo = `Upgrade de ${u.viejo.nombre} a ${u.nuevo.nombre}: +${mx(u.diferencia)} (de ${mx(Number(anterior.montoCongelado))} a ${mx(Number(anterior.montoCongelado) + u.diferencia)}; el precio congelado se conserva). Hoy se cobra ${mx(u.calculo.cobroHoy / 100)} y el resto se reparte en las ${u.calculo.quedan.length} exhibiciones que quedan; el plan no se alarga.`;
    const { version, creadas } = await nuevaVersion(tx, u.plan, {
      retirar: u.vivas.map((v) => v.id),
      retiro: EstadoExhibicion.REEMPLAZADA,
      nuevas: [
        ...u.calculo.quedan.map((q) => ({
          numero: q.numero,
          tipo: TipoExhibicion.MENSUALIDAD,
          monto: pesos(q.monto),
          fechaProgramada: q.fechaProgramada,
        })),
        { numero: primera, tipo: TipoExhibicion.UPGRADE, monto: pesos(u.calculo.cobroHoy), fechaProgramada: new Date() },
      ],
      motivo,
      usuario,
    });
    return {
      version,
      cobroId: creadas.find((e) => e.tipo === TipoExhibicion.UPGRADE)!.id,
      anterior,
      renglonesCreados: creados.map((r) => r.id),
      vivasOriginales: u.vivas.map((v) => v.id),
      paquetes: `${u.viejo.nombre} → ${u.nuevo.nombre}`,
    };
  });

  const resultado = await cobrarExhibicion(aplicado.cobroId, { pasarela: opciones.pasarela });
  if (resultado.estado !== "rechazado") return { ...resultado, version: aplicado.version };

  // Rechazado: se restituye todo. Los renglones agregados no se llegaron a
  // vender (nada se cobró por ellos), así que se retiran; el evento los nombra.
  const restituida = await prisma.$transaction(async (tx) => {
    await tx.renglonPlan.deleteMany({ where: { id: { in: aplicado.renglonesCreados } } });
    await tx.plan.update({ where: { id: params.planId }, data: aplicado.anterior });
    const plan: PlanLeido = await leerPlan(tx, params.planId);
    const enVersion = await tx.exhibicion.findMany({
      where: { planId: params.planId, version: aplicado.version, estado: { in: VIVAS } },
    });
    const originales = await tx.exhibicion.findMany({ where: { id: { in: aplicado.vivasOriginales } } });
    return nuevaVersion(tx, plan, {
      retirar: enVersion.map((e) => e.id),
      retiro: EstadoExhibicion.CANCELADA,
      nuevas: originales.map((e) => ({
        numero: e.numero,
        tipo: e.tipo,
        monto: e.monto,
        fechaProgramada: e.fechaProgramada,
      })),
      motivo: `Se revirtió el upgrade (${aplicado.paquetes}) porque el banco rechazó el cobro de la diferencia (${resultado.codigo}). El paquete, la lista de partidas y el calendario vuelven a como estaban en la versión ${aplicado.version - 1}.`,
      usuario: "sistema",
    });
  });
  return { ...resultado, version: restituida.version };
}
