import {
  Prisma,
  EstadoPlan,
  EstadoExhibicion,
  EstadoFinanciero,
  ModalidadPlan,
  OrigenRenglon,
} from "@prisma/client";
import { prisma } from "../prisma";
import {
  pasarela as pasarelaPorDefecto,
  type AccionComprador,
  type Pasarela,
  type SolicitudCobro,
} from "../pasarela";
import { calcularExhibiciones } from "./calculo";
import {
  avisoPerdidaPaquete,
  cotizarEnCatalogo,
  esFinanciable,
  mensajeDebajoDelMinimo,
  type Canasta,
  type Cotizacion,
} from "./canasta";
import { cargarCatalogo, type CatalogoCotizable } from "./catalogo";
import { ReglaError, mx, mxc } from "./errores";
import {
  ETIQUETA_FINANCIERO,
  caminoFinanciero,
  esManual,
  mensajeNoManual,
  mensajeTransicionInvalida,
  puedeTransitar,
} from "./estados";
import { explicarRechazo } from "./rechazos";
import { decidirTrasRechazo } from "./reintentos";
import { evaluarSuspension } from "./suspension";

const { Decimal } = Prisma;

export { ReglaError } from "./errores";

/**
 * La pasarela no contestó (red, caída de Stripe). No se sabe si el cargo se
 * hizo; volver a intentar es seguro porque la llave es la misma.
 */
export class PasarelaError extends Error {
  override name = "PasarelaError";
}

type Tx = Prisma.TransactionClient;

function fechaMasMeses(base: Date, meses: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + meses);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────
// El plan: se genera sobre una lista de partidas (S1-02, S1-03)
// ─────────────────────────────────────────────────────────────────────────

/** Lo que se eligió: un paquete (cerrado o «Arma el tuyo») y, si cambia, la canasta. */
export type Eleccion = { paqueteId: string; canasta?: Canasta };

type PlanPreparado = {
  paqueteId: string;
  cotizacion: Cotizacion;
  precioId: string | null;
  catalogo: CatalogoCotizable;
  exhibiciones: ReturnType<typeof calcularExhibiciones>;
};

/**
 * Cotiza y valida sin escribir nada: reglas de armado, mínimo del proyecto
 * y R7. Si algo no pasa, truena aquí, antes de crear comprador o plan.
 */
async function prepararPlan(prototipoId: string, eleccion: Eleccion): Promise<PlanPreparado> {
  const paquete = await prisma.paquete.findUnique({ where: { id: eleccion.paqueteId } });
  if (!paquete) throw new ReglaError("No se encontró el paquete elegido.");

  const catalogo = await cargarCatalogo(prototipoId);
  const { cotizacion, paquete: cerrado } = cotizarEnCatalogo(catalogo.prototipo, {
    paqueteId: paquete.esArmable ? null : paquete.id,
    canasta: eleccion.canasta,
  });

  const { minimoPlan, anticipoBP } = catalogo.proyecto;
  if (!esFinanciable(cotizacion.total, minimoPlan)) {
    throw new ReglaError(mensajeDebajoDelMinimo(cotizacion.total, minimoPlan));
  }

  const exhibiciones = calcularExhibiciones(
    new Decimal(cotizacion.total),
    new Decimal(anticipoBP).div(10000)
  );
  asegurarR7(cotizacion, exhibiciones);

  return {
    paqueteId: paquete.id,
    cotizacion,
    // El precio de conjunto sólo se usó si siguió siendo paquete.
    precioId: cotizacion.modalidad === "PAQUETE" ? cerrado!.precioId : null,
    catalogo,
    exhibiciones,
  };
}

async function crearPlan(tx: Tx, compradorId: string, p: PlanPreparado) {
  const ahora = new Date();
  const idPorClave = new Map(p.catalogo.prototipo.partidas.map((x) => [x.clave, x.id]));

  const plan = await tx.plan.create({
    data: {
      compradorId,
      paqueteId: p.paqueteId,
      precioId: p.precioId,
      modalidad: ModalidadPlan[p.cotizacion.modalidad],
      montoCongelado: p.cotizacion.total,
      saldo: p.cotizacion.total,
      estado: EstadoPlan.COTIZADO,
      renglones: {
        create: p.cotizacion.renglones.map((r) => ({
          partidaId: idPorClave.get(r.clave)!,
          cantidad: r.cantidad,
          precioLista: r.precioLista,
          precioCongelado: r.importe,
          origen: OrigenRenglon[r.origen],
        })),
      },
      exhibiciones: {
        create: p.exhibiciones.map((e) => ({
          numero: e.numero,
          monto: e.monto,
          fechaProgramada: fechaMasMeses(ahora, e.numero),
        })),
      },
    },
    include: { paquete: true },
  });

  await tx.evento.create({
    data: {
      entidadTipo: "plan",
      entidadId: plan.id,
      tipo: "plan_cotizado",
      estadoNuevo: EstadoPlan.COTIZADO,
      comentario: describirCotizacion(p.cotizacion, plan.paquete.nombre),
    },
  });

  return plan;
}

/**
 * Genera el plan como COTIZACIÓN para un comprador que ya existe. El precio
 * todavía NO se congela: R2 dice que se congela con el anticipo.
 *
 * Sin `canasta`, un paquete cerrado se cotiza tal cual viene. «Arma el tuyo»
 * siempre necesita la canasta.
 */
export async function generarPlan(params: { compradorId: string } & Eleccion) {
  const comprador = await prisma.comprador.findUnique({
    where: { id: params.compradorId },
    include: {
      unidad: true,
      planes: { where: { estado: { in: [EstadoPlan.COTIZADO, EstadoPlan.ACTIVO, EstadoPlan.SUSPENDIDO] } } },
    },
  });
  if (!comprador) throw new ReglaError("No se encontró al comprador.");
  if (comprador.planes.length > 0) {
    throw new ReglaError("Este comprador ya tiene un plan abierto.");
  }

  const preparado = await prepararPlan(comprador.unidad.prototipoId, params);
  return prisma.$transaction((tx) => crearPlan(tx, comprador.id, preparado));
}

/**
 * El alta completa: registra al comprador y genera su plan, las dos cosas o
 * ninguna. Primero cotiza y valida; si la canasta no pasa (debajo del mínimo,
 * cocina en «Arma el tuyo»…), no queda un comprador suelto sin plan.
 */
export async function darDeAlta(params: {
  nombre: string;
  contacto: string;
  unidadId: string;
} & Eleccion) {
  const unidad = await prisma.unidad.findUnique({
    where: { id: params.unidadId },
    include: { comprador: true },
  });
  if (!unidad) throw new ReglaError("No se encontró la unidad.");
  if (unidad.comprador) {
    throw new ReglaError(`Esta unidad ya está dada de alta a nombre de ${unidad.comprador.nombre}.`);
  }

  const preparado = await prepararPlan(unidad.prototipoId, params);

  // Folio correlativo: los compradores no se borran, así que no se repite.
  // Dos altas simultáneas pueden calcular el mismo; la segunda choca con el
  // índice único y vuelve a intentar con el siguiente (en cada vuelta gana una).
  for (let vuelta = 1; ; vuelta++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const total = await tx.comprador.count();
        const comprador = await tx.comprador.create({
          data: {
            nombre: params.nombre,
            contacto: params.contacto,
            unidadId: unidad.id,
            folio: `DU-${String(total + 1).padStart(3, "0")}`,
          },
        });
        const plan = await crearPlan(tx, comprador.id, preparado);
        return { comprador, plan };
      });
    } catch (err) {
      if (esViolacionUnica(err, "unidadId")) {
        throw new ReglaError(
          "Esta unidad ya está dada de alta: alguien la registró al mismo tiempo. Recarga la página para verla."
        );
      }
      if (esViolacionUnica(err, "folio") && vuelta < 10) continue;
      throw err;
    }
  }
}

function describirCotizacion(c: Cotizacion, paquete: string): string {
  const piezas = `${c.renglones.length} ${c.renglones.length === 1 ? "partida" : "partidas"}`;
  const agregadas = c.renglones.filter((r) => r.origen === "AGREGADA").length;
  const que =
    c.modalidad === "ARMA_EL_TUYO"
      ? `«Arma el tuyo», ${piezas} a precio de lista`
      : c.modalidad === "PAQUETE"
        ? `paquete ${paquete}, ${piezas}` +
          (agregadas > 0 ? ` (${agregadas} agregada${agregadas === 1 ? "" : "s"} a lista)` : "")
        : `${avisoPerdidaPaquete(c.perdidaPaquete!)} Quedan ${piezas}`;
  const levantamiento = c.llevaLevantamiento
    ? "Lleva levantamiento en obra."
    : "Sin levantamiento: todo es de catálogo.";
  return `Cotización por ${mx(c.total)}: ${que}. ${levantamiento} El precio se congela cuando se cobre el anticipo.`;
}

/** R7: los renglones y las exhibiciones suman exactamente el total. */
function asegurarR7(c: Cotizacion, exhibiciones: ReturnType<typeof calcularExhibiciones>) {
  const renglones = c.renglones.reduce((a, r) => a + r.importe, 0);
  const plan = exhibiciones.reduce((a, e) => a.add(e.monto), new Decimal(0));
  if (renglones !== c.total || !plan.eq(c.total)) {
    throw new Error(
      `R7 no cuadra: total ${c.total}, renglones ${renglones}, exhibiciones ${plan.toString()}.`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Los cobros: el motor cobra a través de la pasarela (S1-08)
// ─────────────────────────────────────────────────────────────────────────

export type ResultadoCobroMotor =
  | { estado: "exitoso"; referencia: string }
  | { estado: "pendiente"; referencia: string; mensaje: string; accion?: AccionComprador }
  | { estado: "rechazado"; codigo: string; mensaje: string; intento: number };

type Opciones = { pasarela?: Pasarela };

/**
 * Cobra el anticipo. Aquí se aplican las reglas duras:
 * R1 — sin contrato firmado no se cobra.
 * R2 — al cobrarlo, el precio queda congelado, con toda su lista de partidas.
 * R7 — antes de cobrar se verifica que la lista y el plan cuadren al peso.
 * Regla cruzada — APARTADO requiere contrato firmado Y anticipo cobrado.
 */
export async function cobrarAnticipo(planId: string, opciones: Opciones = {}): Promise<ResultadoCobroMotor> {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: {
      comprador: { include: { unidad: { include: { proyecto: true, contrato: true } } } },
      renglones: true,
      exhibiciones: true,
    },
  });
  if (!plan) throw new ReglaError("No se encontró el plan.");

  const unidad = plan.comprador.unidad;
  if (plan.estado === EstadoPlan.CANCELADO) {
    throw new ReglaError("El plan está cancelado: ya no se le cobra nada.");
  }
  if (!unidad.contrato) {
    throw new ReglaError(
      "No se puede cobrar: falta el contrato firmado con Moretti. Regístralo en el expediente de la unidad antes de cobrar el anticipo."
    );
  }
  if (plan.fechaCongelamiento) {
    throw new ReglaError("El anticipo de este plan ya se cobró.");
  }

  const total = new Decimal(plan.montoCongelado);
  const lista = plan.renglones.reduce((a, r) => a.add(r.precioCongelado), new Decimal(0));
  const exhibiciones = plan.exhibiciones.reduce((a, e) => a.add(e.monto), new Decimal(0));
  if (plan.renglones.length === 0 || !lista.eq(total) || !exhibiciones.eq(total)) {
    throw new ReglaError(
      `No se cobra: la lista de partidas (${mx(lista.toNumber())}) o las exhibiciones (${mx(exhibiciones.toNumber())}) no cuadran con el total del plan (${mx(total.toNumber())}). Avisa a sistemas antes de cobrar (R7).`
    );
  }

  const anticipo = plan.exhibiciones.find((e) => e.numero === 0);
  if (!anticipo) throw new ReglaError("El plan no tiene exhibición de anticipo.");

  return ejecutarCobro({
    planId: plan.id,
    compradorId: plan.compradorId,
    exhibicion: anticipo,
    proyecto: unidad.proyecto,
    pasarela: opciones.pasarela ?? pasarelaPorDefecto,
  });
}

/** Cobra una exhibición. La 0 es el anticipo; las demás exigen que ya se haya cobrado. */
export async function cobrarExhibicion(
  exhibicionId: string,
  opciones: Opciones = {}
): Promise<ResultadoCobroMotor> {
  const exhibicion = await prisma.exhibicion.findUnique({
    where: { id: exhibicionId },
    include: { plan: { include: { comprador: { include: { unidad: { include: { proyecto: true } } } } } } },
  });
  if (!exhibicion) throw new ReglaError("No se encontró la exhibición.");
  if (exhibicion.numero === 0) return cobrarAnticipo(exhibicion.planId, opciones);

  const { plan } = exhibicion;
  if (plan.estado === EstadoPlan.CANCELADO) {
    throw new ReglaError("El plan está cancelado: ya no se le cobra nada.");
  }
  if (!plan.fechaCongelamiento) {
    throw new ReglaError(
      "No se puede cobrar una mensualidad antes del anticipo. Cobra primero el anticipo para apartar la unidad."
    );
  }
  if (exhibicion.estado === EstadoExhibicion.PAGADA) {
    throw new ReglaError("Esta exhibición ya está pagada.");
  }

  return ejecutarCobro({
    planId: plan.id,
    compradorId: plan.compradorId,
    exhibicion,
    proyecto: plan.comprador.unidad.proyecto,
    pasarela: opciones.pasarela ?? pasarelaPorDefecto,
  });
}

async function ejecutarCobro(p: {
  planId: string;
  compradorId: string;
  exhibicion: { id: string; numero: number; monto: Prisma.Decimal; intentosRechazados: number };
  proyecto: { id: string; porcentajeComision: Prisma.Decimal };
  pasarela: Pasarela;
}): Promise<ResultadoCobroMotor> {
  const { exhibicion } = p;
  // Sube sólo con un rechazo: dos envíos del mismo cobro comparten llave (D-13).
  const intento = exhibicion.intentosRechazados + 1;
  const { porcentaje, comision } = comisionDe(exhibicion.monto, p.proyecto.porcentajeComision);
  const concepto = conceptoDe(exhibicion.numero);

  const solicitud: SolicitudCobro = {
    planId: p.planId,
    exhibicionId: exhibicion.id,
    numeroExhibicion: exhibicion.numero,
    intento,
    montoCentavos: aCentavos(new Decimal(exhibicion.monto)),
    comisionCentavos: aCentavos(comision),
    compradorId: p.compradorId,
    proyectoId: p.proyecto.id,
    compradorPresente: exhibicion.numero === 0,
  };

  if (!solicitud.compradorPresente) {
    const comprador = await prisma.comprador.findUnique({
      where: { id: p.compradorId },
      select: { tarjetaInvalida: true },
    });
    if (comprador?.tarjetaInvalida) {
      throw new ReglaError(
        "La tarjeta del comprador quedó marcada como inválida (el banco la reportó perdida, robada o retenida). Pídele que registre otra antes de cobrar."
      );
    }
  }

  let resultado;
  try {
    resultado = await p.pasarela.cobrar(solicitud);
  } catch (err) {
    // Una regla que revisa la pasarela (sin tarjeta, sin cuenta de Moretti):
    // no se llegó a cobrar y el mensaje dice qué falta.
    if (err instanceof ReglaError) throw err;
    await prisma.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: p.planId,
        tipo: "cobro_sin_respuesta",
        comentario: `La pasarela no respondió al cobrar ${concepto} (intento ${intento}). No se marcó nada. Volver a cobrar es seguro: va con la misma llave, así que no se cobra dos veces.`,
      },
    });
    throw new PasarelaError(
      "La pasarela no respondió. Vuelve a intentar: el cobro va con la misma llave y no se cobra dos veces.",
      { cause: err }
    );
  }

  switch (resultado.estado) {
    case "exitoso":
      await aplicarPago({
        exhibicionId: exhibicion.id,
        referencia: resultado.referenciaPasarela,
        porcentaje,
        comision,
      });
      return { estado: "exitoso", referencia: resultado.referenciaPasarela };

    case "pendiente":
      // El barrido no la vuelve a cobrar mientras el webhook no diga en qué quedó.
      await prisma.exhibicion.updateMany({
        where: { id: exhibicion.id, estado: { not: EstadoExhibicion.PAGADA } },
        data: { cobroPendienteDesde: new Date(), referenciaPendiente: resultado.referenciaPasarela },
      });
      await prisma.evento.create({
        data: {
          entidadTipo: "plan",
          entidadId: p.planId,
          tipo: "cobro_pendiente",
          comentario: `El cobro de ${concepto} por ${mx(new Decimal(exhibicion.monto).toNumber())} quedó pendiente (${resultado.motivo}, referencia ${resultado.referenciaPasarela}). No se marcó como pagado: se aplica cuando Stripe lo confirme.`,
        },
      });
      return {
        estado: "pendiente",
        referencia: resultado.referenciaPasarela,
        mensaje: `El cobro quedó pendiente: ${resultado.motivo}. No se marcó como pagado; se aplica cuando el banco lo confirme.`,
        ...(resultado.accion ? { accion: resultado.accion } : {}),
      };

    case "rechazado": {
      await registrarCobroRechazado({
        exhibicionId: exhibicion.id,
        intento,
        codigo: resultado.codigoRechazo,
        consejo: resultado.consejo,
      });
      const despues = await prisma.exhibicion.findUniqueOrThrow({ where: { id: exhibicion.id } });
      return {
        estado: "rechazado",
        codigo: resultado.codigoRechazo,
        intento,
        mensaje: `El banco rechazó el cobro: ${explicarRechazo(resultado.codigoRechazo)} (${resultado.codigoRechazo}). ${capitalizar(concepto)} sigue pendiente y el rechazo quedó en la bitácora.${queSigue(despues)}`,
      };
    }
  }
}

/** Lo que sigue después de un rechazo de mensualidad, para el mensaje del back office. */
function queSigue(e: { numero: number; requiereTarjetaNueva: boolean; proximoIntentoEn: Date | null }) {
  if (e.numero === 0) return "";
  if (e.requiereTarjetaNueva) return " No se reintenta sola: hace falta que el comprador registre otra tarjeta.";
  if (e.proximoIntentoEn) return ` Se reintenta sola a partir del ${fechaCorta(e.proximoIntentoEn)}.`;
  return "";
}

function fechaCorta(d: Date) {
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Aplica un cobro que la pasarela confirmó. Es lo que llama el webhook de
 * `payment_intent.succeeded` (S1-10) cuando el cobro había quedado pendiente.
 * Si ese pago ya estaba aplicado —porque la respuesta de `cobrar` llegó
 * primero, o Stripe reenvió el evento— no hace nada.
 *
 * La pasarela es la fuente de la verdad sobre el dinero: si el webhook trae
 * lo que Stripe cobró de verdad (monto y comisión) y no coincide con la base,
 * se registra lo de Stripe y queda una alerta en la bitácora.
 */
export async function aplicarCobroConfirmado(params: {
  exhibicionId: string;
  referenciaPasarela: string;
  /** Lo que Stripe cobró (`amount`). */
  montoCentavos?: number;
  /** La comisión que Stripe cobró (`application_fee_amount`). */
  comisionCentavos?: number | null;
}) {
  const exhibicion = await prisma.exhibicion.findUnique({
    where: { id: params.exhibicionId },
    include: { plan: { include: { comprador: { include: { unidad: { include: { proyecto: true } } } } } } },
  });
  if (!exhibicion) throw new ReglaError("No se encontró la exhibición del cobro confirmado.");
  let { porcentaje, comision } = comisionDe(
    exhibicion.monto,
    exhibicion.plan.comprador.unidad.proyecto.porcentajeComision
  );
  let monto = new Decimal(exhibicion.monto);
  const alertas: string[] = [];

  if (params.montoCentavos !== undefined) {
    const deStripe = new Decimal(params.montoCentavos).div(100);
    if (!deStripe.eq(monto)) {
      alertas.push(`Stripe cobró ${mxc(deStripe.toNumber())} y la exhibición es de ${mxc(monto.toNumber())}`);
      monto = deStripe;
    }
  }
  if (params.comisionCentavos !== undefined && params.comisionCentavos !== null) {
    const deStripe = new Decimal(params.comisionCentavos).div(100);
    if (!deStripe.eq(comision)) {
      alertas.push(
        `la comisión cobrada en Stripe fue ${mxc(deStripe.toNumber())} y con el % actual del proyecto serían ${mxc(comision.toNumber())}`
      );
      comision = deStripe;
      porcentaje = monto.gt(0) ? deStripe.div(monto).toDecimalPlaces(4, Decimal.ROUND_HALF_UP) : porcentaje;
    }
  }

  return aplicarPago({
    exhibicionId: exhibicion.id,
    referencia: params.referenciaPasarela,
    porcentaje,
    comision,
    monto,
    alertas,
    montoCentavos: params.montoCentavos,
  });
}

/**
 * Anota un rechazo y sube el contador de intentos, una sola vez por intento:
 * si el webhook de `payment_intent.payment_failed` llega después de que la
 * respuesta de `cobrar` ya lo anotó, no hace nada. Devuelve si lo anotó.
 *
 * En una mensualidad, además, decide qué sigue según el código (rechazos.ts y
 * reintentos.ts): cuándo la vuelve a cobrar el barrido, si hace falta otra
 * tarjeta o si la tarjeta queda inválida para todo el plan. Si ya pasó su
 * fecha, queda VENCIDA, y con eso el plan se puede suspender (suspension.ts).
 * El rechazo en sí no cambia el estado del plan. El anticipo no se reintenta
 * solo: lo reintenta el comprador presente.
 */
export async function registrarCobroRechazado(params: {
  exhibicionId: string;
  intento: number;
  codigo: string;
  /** El consejo del banco (advice_code). Si dice que no se reintente, se respeta. */
  consejo?: string | null;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.exhibicion.updateMany({
      where: {
        id: params.exhibicionId,
        intentosRechazados: params.intento - 1,
        estado: { not: EstadoExhibicion.PAGADA },
      },
      data: {
        intentosRechazados: params.intento,
        cobroPendienteDesde: null,
        referenciaPendiente: null,
        ultimoCodigoRechazo: params.codigo,
      },
    });
    if (count === 0) return false;

    const exhibicion = await tx.exhibicion.findUniqueOrThrow({
      where: { id: params.exhibicionId },
      include: { plan: { select: { compradorId: true } } },
    });
    let queSigue = "La exhibición sigue pendiente; el siguiente intento va con llave nueva.";
    let vencio = false;

    if (exhibicion.numero > 0) {
      const ahora = new Date();
      const rechazos = exhibicion.rechazosConTarjeta + 1;
      const decision = decidirTrasRechazo({
        codigo: params.codigo,
        consejo: params.consejo,
        rechazosConTarjeta: rechazos,
        ahora,
      });
      vencio = exhibicion.estado !== EstadoExhibicion.VENCIDA && exhibicion.fechaProgramada <= ahora;
      await tx.exhibicion.update({
        where: { id: exhibicion.id },
        data: {
          rechazosConTarjeta: rechazos,
          ...(vencio ? { estado: EstadoExhibicion.VENCIDA } : {}),
          ...(decision.tipo === "reintentar"
            ? { proximoIntentoEn: decision.en, requiereTarjetaNueva: false }
            : { proximoIntentoEn: null, requiereTarjetaNueva: true }),
        },
      });
      if (decision.tipo === "tarjeta_invalida") {
        await tx.comprador.update({
          where: { id: exhibicion.plan.compradorId },
          data: { tarjetaInvalida: true },
        });
      }
      queSigue =
        decision.tipo === "reintentar"
          ? `Se reintenta sola a partir del ${fechaCorta(decision.en)} (reintento ${decision.numero} de ${decision.de} por este motivo), con llave nueva.`
          : decision.tipo === "tarjeta_invalida"
            ? `No se reintenta: ${decision.motivo}. La tarjeta quedó marcada como inválida para todo el plan hasta que el comprador registre otra.`
            : `No se reintenta sola: ${decision.motivo}. Hay que pedirle al comprador que registre otra tarjeta.`;
      if (vencio) queSigue += ` La mensualidad ${exhibicion.numero} quedó vencida.`;
    }

    await tx.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: exhibicion.planId,
        tipo: "cobro_rechazado",
        comentario: `El banco rechazó ${conceptoDe(exhibicion.numero)} por ${mx(new Decimal(exhibicion.monto).toNumber())} (intento ${params.intento}): ${params.codigo}, ${explicarRechazo(params.codigo)}.${params.consejo ? ` Consejo del banco: ${params.consejo}.` : ""} ${queSigue}`,
      },
    });
    if (vencio) {
      await evaluarSuspension(tx, exhibicion.planId, `la mensualidad ${exhibicion.numero} se venció sin cobrarse`);
    }
    return true;
  });
}

/**
 * Marca VENCIDA una mensualidad que llegó a su fecha y no se pudo cobrar sin
 * que el banco la rechazara (sin tarjeta, pasarela caída). Con bitácora y
 * revisando la suspensión. Devuelve si la marcó.
 */
export async function marcarVencida(params: { exhibicionId: string; ahora: Date; porque: string }): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.exhibicion.updateMany({
      where: {
        id: params.exhibicionId,
        numero: { gt: 0 },
        estado: EstadoExhibicion.PENDIENTE,
        fechaProgramada: { lt: params.ahora },
      },
      data: { estado: EstadoExhibicion.VENCIDA },
    });
    if (count === 0) return false;
    const exhibicion = await tx.exhibicion.findUniqueOrThrow({ where: { id: params.exhibicionId } });
    await tx.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: exhibicion.planId,
        tipo: "exhibicion_vencida",
        estadoAnterior: EstadoExhibicion.PENDIENTE,
        estadoNuevo: EstadoExhibicion.VENCIDA,
        comentario: `La mensualidad ${exhibicion.numero} llegó a su fecha y no se pudo cobrar: ${params.porque}.`,
      },
    });
    await evaluarSuspension(tx, exhibicion.planId, `la mensualidad ${exhibicion.numero} se venció sin cobrarse`);
    return true;
  });
}

type ResultadoAplicacion = "aplicado" | "ya_aplicado" | "otro_cargo";

async function aplicarPago(p: {
  exhibicionId: string;
  referencia: string;
  porcentaje: Prisma.Decimal;
  comision: Prisma.Decimal;
  /** Lo que cobró Stripe, si difiere de la exhibición. Manda Stripe. */
  monto?: Prisma.Decimal;
  /** Diferencias con Stripe que quedan como alerta en la bitácora. */
  alertas?: string[];
  /** Para registrar un cargo excedente con su monto. */
  montoCentavos?: number;
}): Promise<ResultadoAplicacion> {
  try {
    return await prisma.$transaction(async (tx) => {
      const exhibicion = await tx.exhibicion.findUniqueOrThrow({
        where: { id: p.exhibicionId },
        include: {
          pago: true,
          plan: { include: { comprador: { include: { unidad: true } }, renglones: true } },
        },
      });
      if (exhibicion.pago) {
        return await compararReferencia(tx, exhibicion.pago, p.referencia, exhibicion, p.montoCentavos);
      }

      const { plan } = exhibicion;
      const monto = new Decimal(p.monto ?? exhibicion.monto);
      const esAnticipo = exhibicion.numero === 0;
      const saldo = new Decimal(plan.saldo).sub(monto);
      const liquidado = saldo.lte(0);
      const ahora = new Date();

      // Primero el pago: su exhibicionId es único, así que si dos
      // confirmaciones del mismo cobro llegan juntas, la segunda truena aquí
      // y no toca saldo ni estados.
      await tx.pago.create({
        data: {
          planId: plan.id,
          exhibicionId: exhibicion.id,
          monto,
          fecha: ahora,
          referenciaStripe: p.referencia,
          // Sólo los de Stripe: la pasarela falsa manda referencias propias.
          ...(p.referencia.startsWith("pi_") ? { stripePaymentIntentId: p.referencia } : {}),
          porcentajeComision: p.porcentaje,
          montoComision: p.comision,
        },
      });
      await tx.exhibicion.update({
        where: { id: exhibicion.id },
        data: {
          estado: EstadoExhibicion.PAGADA,
          proximoIntentoEn: null,
          requiereTarjetaNueva: false,
          cobroPendienteDesde: null,
          referenciaPendiente: null,
          ultimoCodigoRechazo: null,
        },
      });
      // Un pago que llega con el plan ya cancelado (el comprador se autenticó
      // tarde) se registra, pero no reabre el plan: eso lo decide una persona.
      // Uno suspendido sigue suspendido hasta que evaluarSuspension diga otra cosa.
      const estadoPlan =
        plan.estado === EstadoPlan.CANCELADO
          ? null
          : liquidado && !esAnticipo
            ? EstadoPlan.LIQUIDADO
            : plan.estado === EstadoPlan.SUSPENDIDO
              ? null
              : EstadoPlan.ACTIVO;
      await tx.plan.update({
        where: { id: plan.id },
        data: {
          saldo: saldo.lt(0) ? 0 : saldo,
          ...(esAnticipo ? { fechaCongelamiento: ahora } : {}),
          ...(estadoPlan ? { estado: estadoPlan } : {}),
        },
      });

      const unidad = plan.comprador.unidad;
      const estadoNuevo = esAnticipo
        ? EstadoFinanciero.APARTADO
        : liquidado
          ? EstadoFinanciero.LIQUIDADO
          : EstadoFinanciero.AL_CORRIENTE;
      await seguirCaminoFinanciero(tx, {
        unidadId: unidad.id,
        desde: unidad.estadoFinanciero,
        hacia: estadoNuevo,
        motivo: esAnticipo ? "se cobró el anticipo" : `se cobró la exhibición ${exhibicion.numero}`,
      });

      const pct = `${p.porcentaje.mul(100).toDecimalPlaces(2).toString()} %`;
      await tx.evento.create({
        data: {
          entidadTipo: "plan",
          entidadId: plan.id,
          tipo: esAnticipo ? "anticipo_cobrado" : "exhibicion_cobrada",
          estadoAnterior: unidad.estadoFinanciero,
          estadoNuevo,
          comentario: esAnticipo
            ? `Anticipo de ${mx(monto.toNumber())} cobrado (referencia ${p.referencia}). Precio congelado en ${mx(new Decimal(plan.montoCongelado).toNumber())} con sus ${plan.renglones.length} partidas: la lista ya no cambia (R2). Comisión del canal: ${mxc(p.comision.toNumber())} (${pct}).`
            : `Exhibición ${exhibicion.numero} de ${mx(monto.toNumber())} cobrada (referencia ${p.referencia}). Comisión del canal: ${mxc(p.comision.toNumber())} (${pct}).`,
        },
      });
      if (p.alertas && p.alertas.length > 0) {
        await tx.evento.create({
          data: {
            entidadTipo: "plan",
            entidadId: plan.id,
            tipo: "discrepancia_stripe",
            comentario: `ALERTA: al aplicar ${conceptoDe(exhibicion.numero)} (${p.referencia}), ${p.alertas.join("; ")}. Se registró lo de Stripe, que es lo que de verdad se cobró. Revisar por qué no coincide.`,
          },
        });
      }
      await evaluarSuspension(tx, plan.id, `se cobró ${conceptoDe(exhibicion.numero)}`);
      return "aplicado" as const;
    });
  } catch (err) {
    if (esViolacionUnica(err)) {
      const pago = await prisma.pago.findUnique({ where: { exhibicionId: p.exhibicionId } });
      if (pago) {
        const exhibicion = await prisma.exhibicion.findUniqueOrThrow({ where: { id: p.exhibicionId } });
        return compararReferencia(prisma, pago, p.referencia, exhibicion, p.montoCentavos);
      }
    }
    throw err;
  }
}

/**
 * La exhibición ya tenía pago. Si es el mismo cargo, es un reenvío y no pasa
 * nada. Si es otro, el dinero sí entró (Stripe manda): queda registrado como
 * cargo excedente, sin tocar el pago que ya estaba (R3), y con una alerta
 * para reembolsarlo.
 */
async function compararReferencia(
  db: Tx | typeof prisma,
  pago: { referenciaStripe: string | null },
  referencia: string,
  exhibicion: { id: string; planId: string; numero: number },
  montoCentavos?: number
): Promise<ResultadoAplicacion> {
  if (pago.referenciaStripe === referencia) return "ya_aplicado";
  const yaRegistrado = await db.cargoExcedente.findUnique({ where: { referenciaStripe: referencia } });
  if (yaRegistrado) return "otro_cargo";

  await db.cargoExcedente.create({
    data: {
      exhibicionId: exhibicion.id,
      planId: exhibicion.planId,
      referenciaStripe: referencia,
      montoCentavos: montoCentavos ?? null,
    },
  });
  await db.evento.create({
    data: {
      entidadTipo: "plan",
      entidadId: exhibicion.planId,
      tipo: "posible_doble_cargo",
      comentario: `ALERTA: ${conceptoDe(exhibicion.numero)} ya estaba pagada con ${pago.referenciaStripe} y llegó otro cargo confirmado, ${referencia}${montoCentavos !== undefined ? ` por ${mxc(montoCentavos / 100)}` : ""}. Es un doble cargo: quedó registrado como cargo excedente; revisarlo en Stripe y reembolsar el que sobre.`,
    },
  });
  return "otro_cargo";
}

function comisionDe(monto: Prisma.Decimal, porcentaje: Prisma.Decimal) {
  const pct = new Decimal(porcentaje);
  return {
    porcentaje: pct,
    comision: new Decimal(monto).mul(pct).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  };
}

/** Pesos con centavos a centavos enteros, sin punto flotante. */
function aCentavos(monto: Prisma.Decimal): number {
  const centavos = monto.mul(100);
  if (!centavos.isInteger()) throw new Error(`Monto con más de dos decimales: ${monto.toString()}`);
  return centavos.toNumber();
}

function conceptoDe(numero: number) {
  return numero === 0 ? "el anticipo" : `la mensualidad ${numero}`;
}

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Choque con un índice único; con `campo`, sólo si es ese. */
function esViolacionUnica(err: unknown, campo?: string) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  if (!campo) return true;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.includes(campo) : String(target ?? "").includes(campo);
}

// ─────────────────────────────────────────────────────────────────────────
// Estado financiero de la unidad (S1-13)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cambia a mano el estado financiero de una unidad: suspender, reactivar,
 * cancelar. Sólo transiciones permitidas; si no procede, el error dice cuál
 * sí. Las que provoca un cobro (APARTADO, LIQUIDADO…) no se hacen a mano.
 * Cancelar exige motivo y cancela también el plan abierto, para que ya no se
 * le cobre.
 */
export async function cambiarEstadoFinanciero(params: {
  unidadId: string;
  hacia: EstadoFinanciero;
  motivo?: string;
  usuario?: string;
}) {
  const motivo = params.motivo?.trim() ?? "";
  if (params.hacia === EstadoFinanciero.CANCELADO && !motivo) {
    throw new ReglaError("Para cancelar hay que escribir el motivo: queda en la bitácora y en el expediente.");
  }

  return prisma.$transaction(async (tx) => {
    const unidad = await tx.unidad.findUnique({
      where: { id: params.unidadId },
      include: { comprador: { include: { planes: true } } },
    });
    if (!unidad) throw new ReglaError("No se encontró la unidad.");
    const desde = unidad.estadoFinanciero;
    if (!puedeTransitar(desde, params.hacia)) {
      throw new ReglaError(mensajeTransicionInvalida(desde, params.hacia));
    }
    if (!esManual(desde, params.hacia)) {
      throw new ReglaError(mensajeNoManual(params.hacia));
    }

    // Condicionado al estado leído: si alguien lo cambió mientras tanto, no se pisa.
    const { count } = await tx.unidad.updateMany({
      where: { id: unidad.id, estadoFinanciero: desde },
      data: { estadoFinanciero: params.hacia },
    });
    if (count === 0) {
      throw new ReglaError("El estado de la unidad cambió mientras tanto. Recarga la página y vuelve a intentar.");
    }
    await tx.evento.create({
      data: {
        entidadTipo: "unidad",
        entidadId: unidad.id,
        tipo: "estado_financiero_cambiado",
        estadoAnterior: desde,
        estadoNuevo: params.hacia,
        usuario: params.usuario ?? "back office",
        comentario: `Estado financiero: ${ETIQUETA_FINANCIERO[desde]} → ${ETIQUETA_FINANCIERO[params.hacia]}${motivo ? `. Motivo: ${motivo}` : ""}.`,
      },
    });

    if (params.hacia === EstadoFinanciero.CANCELADO) {
      const abiertos = (unidad.comprador?.planes ?? []).filter(
        (p) =>
          p.estado === EstadoPlan.COTIZADO || p.estado === EstadoPlan.ACTIVO || p.estado === EstadoPlan.SUSPENDIDO
      );
      for (const plan of abiertos) {
        await tx.plan.update({ where: { id: plan.id }, data: { estado: EstadoPlan.CANCELADO } });
        await tx.evento.create({
          data: {
            entidadTipo: "plan",
            entidadId: plan.id,
            tipo: "plan_cancelado",
            estadoAnterior: plan.estado,
            estadoNuevo: EstadoPlan.CANCELADO,
            usuario: params.usuario ?? "back office",
            comentario: `Plan cancelado: ya no se le cobra nada. Motivo: ${motivo}. Lo ya cobrado no se toca (R3); reembolsos, aparte.`,
          },
        });
      }
    }
    return { desde, hacia: params.hacia };
  });
}

/**
 * Las transiciones que provoca un pago. Un pago ya cobrado nunca se rechaza
 * por el estado: se sigue el camino permitido (SUSPENDIDO → AL_CORRIENTE →
 * LIQUIDADO si una unidad suspendida paga la última) con un evento por paso;
 * y si no hay camino (un pago que llega con la unidad cancelada), el estado
 * no se mueve y queda una alerta.
 */
async function seguirCaminoFinanciero(
  tx: Tx,
  p: { unidadId: string; desde: EstadoFinanciero; hacia: EstadoFinanciero; motivo: string }
) {
  const camino = caminoFinanciero(p.desde, p.hacia);
  if (camino === null) {
    await tx.evento.create({
      data: {
        entidadTipo: "unidad",
        entidadId: p.unidadId,
        tipo: "estado_financiero_inesperado",
        estadoAnterior: p.desde,
        estadoNuevo: p.hacia,
        comentario: `ALERTA: ${p.motivo} con la unidad en ${ETIQUETA_FINANCIERO[p.desde]}, y de ahí no se puede pasar a ${ETIQUETA_FINANCIERO[p.hacia]}. El pago quedó registrado; el estado no se movió. Revisar: puede tocar un reembolso.`,
      },
    });
    return;
  }
  let actual = p.desde;
  for (const siguiente of camino) {
    await tx.unidad.update({ where: { id: p.unidadId }, data: { estadoFinanciero: siguiente } });
    await tx.evento.create({
      data: {
        entidadTipo: "unidad",
        entidadId: p.unidadId,
        tipo: "estado_financiero_cambiado",
        estadoAnterior: actual,
        estadoNuevo: siguiente,
        comentario: `Estado financiero: ${ETIQUETA_FINANCIERO[actual]} → ${ETIQUETA_FINANCIERO[siguiente]} porque ${p.motivo}.`,
      },
    });
    actual = siguiente;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// La tarjeta de las mensualidades (S1-06)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Prepara la captura de la tarjeta del comprador de un plan. Sin la
 * autorización explícita de los cargos futuros no se prepara nada: es lo que
 * permite cobrar las mensualidades sin que el comprador esté presente.
 */
export async function prepararTarjeta(
  params: { planId: string; consentimiento: boolean },
  opciones: Opciones = {}
) {
  if (params.consentimiento !== true) {
    throw new ReglaError(
      "Para guardar la tarjeta, el comprador tiene que autorizar que ahí se le carguen sus mensualidades."
    );
  }
  const plan = await planParaTarjeta(params.planId);
  return (opciones.pasarela ?? pasarelaPorDefecto).prepararTarjeta({
    compradorId: plan.compradorId,
    proyectoId: plan.comprador.unidad.proyectoId,
  });
}

/**
 * El navegador terminó de capturar la tarjeta. La pasarela verifica que sí
 * quedó guardada y que es de este comprador; hasta entonces no se registra.
 */
export async function registrarTarjeta(
  params: { planId: string; referenciaPreparacion: string },
  opciones: Opciones = {}
) {
  const plan = await planParaTarjeta(params.planId);
  const tarjeta = await (opciones.pasarela ?? pasarelaPorDefecto).confirmarTarjeta({
    compradorId: plan.compradorId,
    referenciaPreparacion: params.referenciaPreparacion,
  });
  await guardarTarjeta({ compradorId: plan.compradorId, ...tarjeta });
  return tarjeta;
}

/**
 * Guarda la tarjeta con la que se cobran las mensualidades y deja la
 * autorización en la bitácora. La llama `registrarTarjeta` y también el
 * webhook de `setup_intent.succeeded`: la que llegue segunda no hace nada.
 * Devuelve si la guardó.
 */
export async function guardarTarjeta(params: {
  compradorId: string;
  referenciaTarjeta: string;
  descripcion: string;
  venceMes?: number;
  venceAnio?: number;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.comprador.findUnique({
      where: { id: params.compradorId },
      select: { tarjetaInvalida: true },
    });
    // `not` solo no encuentra los null: por eso el OR.
    const { count } = await tx.comprador.updateMany({
      where: {
        id: params.compradorId,
        OR: [{ stripePaymentMethodId: null }, { stripePaymentMethodId: { not: params.referenciaTarjeta } }],
      },
      data: {
        stripePaymentMethodId: params.referenciaTarjeta,
        tarjetaDescripcion: params.descripcion,
        tarjetaVenceMes: params.venceMes ?? null,
        tarjetaVenceAnio: params.venceAnio ?? null,
        tarjetaInvalida: false,
      },
    });
    if (count === 0) return false;

    // Con tarjeta nueva, lo que esperaba otra tarjeta vuelve al barrido y la
    // cuenta de reintentos empieza de cero. La llave sigue subiendo aparte.
    const { count: reactivadas } = await tx.exhibicion.updateMany({
      where: {
        plan: { compradorId: params.compradorId, estado: { not: EstadoPlan.CANCELADO } },
        estado: { not: EstadoExhibicion.PAGADA },
        OR: [{ requiereTarjetaNueva: true }, { rechazosConTarjeta: { gt: 0 } }],
      },
      data: { requiereTarjetaNueva: false, rechazosConTarjeta: 0, proximoIntentoEn: null },
    });

    const comprador = await tx.comprador.findUniqueOrThrow({ where: { id: params.compradorId } });
    await tx.evento.create({
      data: {
        entidadTipo: "unidad",
        entidadId: comprador.unidadId,
        tipo: "tarjeta_registrada",
        usuario: comprador.nombre,
        comentario: `${comprador.nombre} registró su ${params.descripcion} y autorizó que ahí se le carguen las mensualidades de su plan sin estar presente.${antes?.tarjetaInvalida ? " Reemplaza a la que el banco reportó como inválida." : ""}${reactivadas > 0 ? ` ${reactivadas === 1 ? "La mensualidad rechazada vuelve" : `Las ${reactivadas} mensualidades rechazadas vuelven`} a cobrarse en el siguiente barrido.` : ""}`,
      },
    });
    return true;
  });
}

/**
 * El banco renovó la tarjeta guardada por su cuenta (en Stripe,
 * `payment_method.automatically_updated`): nuevo vencimiento y, a veces,
 * nuevos últimos cuatro. Si alguna mensualidad esperaba otra tarjeta porque
 * la anterior estaba vencida, vuelve al barrido. Devuelve si encontró al comprador.
 */
export async function actualizarTarjetaDelBanco(params: {
  referenciaTarjeta: string;
  descripcion: string;
  venceMes?: number;
  venceAnio?: number;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const comprador = await tx.comprador.findFirst({ where: { stripePaymentMethodId: params.referenciaTarjeta } });
    if (!comprador) return false;

    await tx.comprador.update({
      where: { id: comprador.id },
      data: {
        tarjetaDescripcion: params.descripcion,
        tarjetaVenceMes: params.venceMes ?? comprador.tarjetaVenceMes,
        tarjetaVenceAnio: params.venceAnio ?? comprador.tarjetaVenceAnio,
      },
    });
    const { count: reactivadas } = await tx.exhibicion.updateMany({
      where: {
        plan: { compradorId: comprador.id, estado: { not: EstadoPlan.CANCELADO } },
        estado: { not: EstadoExhibicion.PAGADA },
        requiereTarjetaNueva: true,
        ultimoCodigoRechazo: "expired_card",
      },
      data: { requiereTarjetaNueva: false, rechazosConTarjeta: 0, proximoIntentoEn: null },
    });
    const vence =
      params.venceMes && params.venceAnio ? ` Vence ${String(params.venceMes).padStart(2, "0")}/${params.venceAnio}.` : "";
    await tx.evento.create({
      data: {
        entidadTipo: "unidad",
        entidadId: comprador.unidadId,
        tipo: "tarjeta_actualizada_por_banco",
        comentario: `El banco actualizó la tarjeta de ${comprador.nombre}: ahora es ${params.descripcion}.${vence}${reactivadas > 0 ? ` ${reactivadas === 1 ? "La mensualidad rechazada por tarjeta vencida vuelve" : `Las ${reactivadas} mensualidades rechazadas por tarjeta vencida vuelven`} a cobrarse en el siguiente barrido.` : ""}`,
      },
    });
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Anticipo con captura manual (STRIPE_CAPTURE_METHOD = manual)
// ─────────────────────────────────────────────────────────────────────────

/**
 * El banco autorizó el anticipo y el dinero quedó apartado, sin cobrar (en
 * Stripe, `payment_intent.amount_capturable_updated`). No se aplica ningún
 * pago: sólo se anota y se recuerda la referencia para capturarla o liberarla.
 */
export async function registrarAutorizacion(params: {
  exhibicionId: string;
  referenciaPasarela: string;
  montoCentavos: number;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const exhibicion = await tx.exhibicion.findUniqueOrThrow({ where: { id: params.exhibicionId } });
    if (exhibicion.estado === EstadoExhibicion.PAGADA) return false;
    await tx.exhibicion.update({
      where: { id: exhibicion.id },
      data: { cobroPendienteDesde: exhibicion.cobroPendienteDesde ?? new Date(), referenciaPendiente: params.referenciaPasarela },
    });
    await tx.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: exhibicion.planId,
        tipo: "cobro_autorizado",
        comentario: `El banco autorizó ${conceptoDe(exhibicion.numero)} por ${mxc(params.montoCentavos / 100)} (${params.referenciaPasarela}). El dinero está apartado, no cobrado: falta capturarlo o liberarlo.`,
      },
    });
    return true;
  });
}

/** Cobra el anticipo que quedó autorizado. Contesta como cualquier cobro. */
export async function capturarAnticipo(planId: string, opciones: Opciones = {}): Promise<ResultadoCobroMotor> {
  const { anticipo, proyecto } = await anticipoAutorizado(planId);
  const pasarela = opciones.pasarela ?? pasarelaPorDefecto;
  const referencia = anticipo.referenciaPendiente!;

  let resultado;
  try {
    resultado = await pasarela.capturar({ referenciaPasarela: referencia, proyectoId: proyecto.id });
  } catch (err) {
    if (err instanceof ReglaError) throw err;
    throw new PasarelaError("La pasarela no respondió al capturar. Vuelve a intentar: no se captura dos veces.", {
      cause: err,
    });
  }

  if (resultado.estado === "exitoso") {
    const { porcentaje, comision } = comisionDe(anticipo.monto, proyecto.porcentajeComision);
    await aplicarPago({ exhibicionId: anticipo.id, referencia: resultado.referenciaPasarela, porcentaje, comision });
    return { estado: "exitoso", referencia: resultado.referenciaPasarela };
  }
  if (resultado.estado === "rechazado") {
    const intento = anticipo.intentosRechazados + 1;
    await registrarCobroRechazado({ exhibicionId: anticipo.id, intento, codigo: resultado.codigoRechazo });
    return {
      estado: "rechazado",
      codigo: resultado.codigoRechazo,
      intento,
      mensaje: `No se pudo capturar el anticipo: ${explicarRechazo(resultado.codigoRechazo)} (${resultado.codigoRechazo}).`,
    };
  }
  return {
    estado: "pendiente",
    referencia: resultado.referenciaPasarela,
    mensaje: `La captura quedó pendiente: ${resultado.motivo}.`,
  };
}

/**
 * Libera el anticipo autorizado sin cobrarlo. Se anota como intento cerrado
 * (`autorizacion_liberada`): el siguiente cobro va con llave nueva.
 */
export async function liberarAnticipo(planId: string, opciones: Opciones = {}) {
  const { anticipo, proyecto } = await anticipoAutorizado(planId);
  const pasarela = opciones.pasarela ?? pasarelaPorDefecto;
  try {
    await pasarela.liberar({ referenciaPasarela: anticipo.referenciaPendiente!, proyectoId: proyecto.id });
  } catch (err) {
    if (err instanceof ReglaError) throw err;
    throw new PasarelaError("La pasarela no respondió al liberar. Vuelve a intentar.", { cause: err });
  }
  // El webhook payment_intent.canceled hace lo mismo; el que llegue segundo no anota nada.
  await registrarCobroRechazado({
    exhibicionId: anticipo.id,
    intento: anticipo.intentosRechazados + 1,
    codigo: "autorizacion_liberada",
  });
}

async function anticipoAutorizado(planId: string) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { exhibiciones: { where: { numero: 0 } }, comprador: { include: { unidad: { include: { proyecto: true } } } } },
  });
  if (!plan) throw new ReglaError("No se encontró el plan.");
  const anticipo = plan.exhibiciones[0];
  if (!anticipo) throw new ReglaError("El plan no tiene exhibición de anticipo.");
  if (anticipo.estado === EstadoExhibicion.PAGADA) throw new ReglaError("El anticipo de este plan ya se cobró.");
  if (!anticipo.referenciaPendiente) {
    throw new ReglaError("El anticipo no tiene un cobro autorizado pendiente: no hay nada que capturar ni liberar.");
  }
  return { anticipo, proyecto: plan.comprador.unidad.proyecto };
}

async function planParaTarjeta(planId: string) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { comprador: { include: { unidad: true } } },
  });
  if (!plan) throw new ReglaError("No se encontró el plan.");
  if (plan.estado === EstadoPlan.CANCELADO) {
    throw new ReglaError("El plan está cancelado: ya no se le cobra nada.");
  }
  if (plan.estado === EstadoPlan.LIQUIDADO) {
    throw new ReglaError("El plan ya está liquidado: no hace falta tarjeta.");
  }
  return plan;
}

/**
 * Lo que consulta el navegador mientras espera a que el webhook aplique un
 * cobro pendiente. Sólo lee: nunca marca nada.
 */
export async function estadoCobro(exhibicionId: string) {
  const exhibicion = await prisma.exhibicion.findUnique({
    where: { id: exhibicionId },
    include: { pago: true },
  });
  if (!exhibicion) throw new ReglaError("No se encontró la exhibición.");
  return {
    pagada: exhibicion.estado === EstadoExhibicion.PAGADA,
    referencia: exhibicion.pago?.referenciaStripe ?? null,
    intentosRechazados: exhibicion.intentosRechazados,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Contrato (R1)
// ─────────────────────────────────────────────────────────────────────────
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
