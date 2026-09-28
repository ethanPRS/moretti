import {
  Prisma,
  EstadoPlan,
  EstadoExhibicion,
  EstadoFinanciero,
  ModalidadPlan,
  OrigenRenglon,
} from "@prisma/client";
import { prisma } from "../prisma";
import { pasarela as pasarelaPorDefecto, type Pasarela, type SolicitudCobro } from "../pasarela";
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
      planes: { where: { estado: { in: [EstadoPlan.COTIZADO, EstadoPlan.ACTIVO] } } },
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
  | { estado: "pendiente"; referencia: string; mensaje: string }
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

  let resultado;
  try {
    resultado = await p.pasarela.cobrar(solicitud);
  } catch (err) {
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
      };

    case "rechazado":
      await registrarCobroRechazado({
        exhibicionId: exhibicion.id,
        intento,
        codigo: resultado.codigoRechazo,
      });
      return {
        estado: "rechazado",
        codigo: resultado.codigoRechazo,
        intento,
        mensaje: `El banco rechazó el cobro: ${explicarRechazo(resultado.codigoRechazo)} (${resultado.codigoRechazo}). ${capitalizar(concepto)} sigue pendiente y el rechazo quedó en la bitácora.`,
      };
  }
}

/**
 * Aplica un cobro que la pasarela confirmó. Es lo que llama el webhook de
 * `payment_intent.succeeded` (S1-10) cuando el cobro había quedado pendiente.
 * Si ese pago ya estaba aplicado —porque la respuesta de `cobrar` llegó
 * primero, o Stripe reenvió el evento— no hace nada.
 */
export async function aplicarCobroConfirmado(params: { exhibicionId: string; referenciaPasarela: string }) {
  const exhibicion = await prisma.exhibicion.findUnique({
    where: { id: params.exhibicionId },
    include: { plan: { include: { comprador: { include: { unidad: { include: { proyecto: true } } } } } } },
  });
  if (!exhibicion) throw new ReglaError("No se encontró la exhibición del cobro confirmado.");
  const { porcentaje, comision } = comisionDe(
    exhibicion.monto,
    exhibicion.plan.comprador.unidad.proyecto.porcentajeComision
  );
  return aplicarPago({
    exhibicionId: exhibicion.id,
    referencia: params.referenciaPasarela,
    porcentaje,
    comision,
  });
}

/**
 * Anota un rechazo y sube el contador de intentos, una sola vez por intento:
 * si el webhook de `payment_intent.payment_failed` llega después de que la
 * respuesta de `cobrar` ya lo anotó, no hace nada. Devuelve si lo anotó.
 */
export async function registrarCobroRechazado(params: {
  exhibicionId: string;
  intento: number;
  codigo: string;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.exhibicion.updateMany({
      where: {
        id: params.exhibicionId,
        intentosRechazados: params.intento - 1,
        estado: { not: EstadoExhibicion.PAGADA },
      },
      data: { intentosRechazados: params.intento },
    });
    if (count === 0) return false;

    const exhibicion = await tx.exhibicion.findUniqueOrThrow({ where: { id: params.exhibicionId } });
    await tx.evento.create({
      data: {
        entidadTipo: "plan",
        entidadId: exhibicion.planId,
        tipo: "cobro_rechazado",
        comentario: `El banco rechazó ${conceptoDe(exhibicion.numero)} por ${mx(new Decimal(exhibicion.monto).toNumber())} (intento ${params.intento}): ${params.codigo}, ${explicarRechazo(params.codigo)}. La exhibición sigue pendiente; el siguiente intento va con llave nueva.`,
      },
    });
    return true;
  });
}

type ResultadoAplicacion = "aplicado" | "ya_aplicado" | "otro_cargo";

async function aplicarPago(p: {
  exhibicionId: string;
  referencia: string;
  porcentaje: Prisma.Decimal;
  comision: Prisma.Decimal;
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
      if (exhibicion.pago) return await compararReferencia(tx, exhibicion.pago, p.referencia, exhibicion);

      const { plan } = exhibicion;
      const monto = new Decimal(exhibicion.monto);
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
          porcentajeComision: p.porcentaje,
          montoComision: p.comision,
        },
      });
      await tx.exhibicion.update({
        where: { id: exhibicion.id },
        data: { estado: EstadoExhibicion.PAGADA },
      });
      // Un pago que llega con el plan ya cancelado (el comprador se autenticó
      // tarde) se registra, pero no reabre el plan: eso lo decide una persona.
      const cancelado = plan.estado === EstadoPlan.CANCELADO;
      await tx.plan.update({
        where: { id: plan.id },
        data: {
          saldo: saldo.lt(0) ? 0 : saldo,
          ...(esAnticipo ? { fechaCongelamiento: ahora } : {}),
          ...(cancelado
            ? {}
            : { estado: esAnticipo || !liquidado ? EstadoPlan.ACTIVO : EstadoPlan.LIQUIDADO }),
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
      return "aplicado" as const;
    });
  } catch (err) {
    if (esViolacionUnica(err)) {
      const pago = await prisma.pago.findUnique({ where: { exhibicionId: p.exhibicionId } });
      if (pago) {
        const exhibicion = await prisma.exhibicion.findUniqueOrThrow({ where: { id: p.exhibicionId } });
        return compararReferencia(prisma, pago, p.referencia, exhibicion);
      }
    }
    throw err;
  }
}

/**
 * La exhibición ya tenía pago. Si es el mismo cargo, es un reenvío y no pasa
 * nada. Si es otro, puede ser un doble cargo: se deja en la bitácora para que
 * alguien lo revise en Stripe, sin tocar el pago que ya estaba.
 */
async function compararReferencia(
  db: Tx | typeof prisma,
  pago: { referenciaStripe: string | null },
  referencia: string,
  exhibicion: { planId: string; numero: number }
): Promise<ResultadoAplicacion> {
  if (pago.referenciaStripe === referencia) return "ya_aplicado";
  await db.evento.create({
    data: {
      entidadTipo: "plan",
      entidadId: exhibicion.planId,
      tipo: "posible_doble_cargo",
      comentario: `ALERTA: ${conceptoDe(exhibicion.numero)} ya estaba pagada con ${pago.referenciaStripe} y llegó otro cargo confirmado, ${referencia}. Puede ser un doble cargo: revisarlo en Stripe y reembolsar el que sobre.`,
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
        (p) => p.estado === EstadoPlan.COTIZADO || p.estado === EstadoPlan.ACTIVO
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
