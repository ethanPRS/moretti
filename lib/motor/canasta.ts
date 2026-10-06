/**
 * Cómo se cotiza lo que se vende: una lista de partidas con precio (spec §4).
 *
 * Es la única implementación de las reglas de armado. La usan el cotizador
 * del sitio, el alta del back office (las dos en el navegador) y el motor al
 * generar el plan (en el servidor): por eso es pura, sin Prisma, y trabaja
 * en pesos enteros. Si el sitio y el alta dan el mismo total para la misma
 * canasta es porque llaman a esta misma función con el mismo catálogo.
 *
 * Las tres reglas:
 * - Agregar a un paquete cerrado: se suma a precio de lista; el paquete
 *   conserva su precio de conjunto.
 * - Quitar de un paquete cerrado (o bajarle la cantidad a una partida):
 *   deja de ser paquete y todo lo que queda se cobra a lista.
 * - Canasta desde cero: «Arma el tuyo», cada partida a lista, sin cocina.
 */
import { ReglaError, mx } from "./errores";

export type Familia = "A_LA_MEDIDA" | "DE_CATALOGO" | "VALE";

/** Una partida del catálogo con su precio de lista en un prototipo. */
export type PartidaCotizable = {
  clave: string;
  nombre: string;
  familia: Familia;
  /** Se puede escoger en «Arma el tuyo». La cocina no. */
  armable: boolean;
  /** Se vende por equipo, con cantidad (los climas). Las demás van una vez. */
  porEquipo: boolean;
  /** Viene marcada de entrada en «Arma el tuyo» (clósets y carpintería). */
  porDefecto: boolean;
  orden: number;
  /** Precio de lista por pieza, en pesos enteros. Null si no hay precio en el prototipo. */
  precioLista: number | null;
};

/** Un paquete cerrado en un prototipo: su precio de conjunto y lo que trae. */
export type PaqueteCotizable = {
  id: string;
  nombre: string;
  precio: number;
  /** Clave de partida → cantidad incluida (los climas, los del prototipo). */
  contenido: Record<string, number>;
};

/** Clave de partida → cantidad. Cero o ausente es que no va. */
export type Canasta = Record<string, number>;

export type Modalidad = "PAQUETE" | "A_LISTA" | "ARMA_EL_TUYO";
/** De dónde salió el renglón: del paquete, o lo agregó el comprador. */
export type Origen = "PAQUETE" | "AGREGADA";

export type RenglonCotizado = {
  clave: string;
  nombre: string;
  familia: Familia;
  cantidad: number;
  /** Por pieza. */
  precioLista: number;
  /** Lo que el renglón suma al total, cantidad incluida. */
  importe: number;
  origen: Origen;
};

export type PerdidaPaquete = {
  paquete: string;
  /** Nombres de lo que se quitó; si se bajó una cantidad, dice cuántos de cuántos. */
  quitadas: string[];
  /**
   * Cuánto más se paga contra «el paquete menos lo quitado a lista». Es el
   * descuento de conjunto que se pierde: Σ lista(contenido) − precio.
   */
  diferencia: number;
};

export type Cotizacion = {
  modalidad: Modalidad;
  total: number;
  renglones: RenglonCotizado[];
  perdidaPaquete: PerdidaPaquete | null;
  /** Sólo si hay algo a la medida: una canasta de puro catálogo va directo a pedido. */
  llevaLevantamiento: boolean;
};

/** Tope del contador de climas, en el sitio, en el alta y en el motor. */
export const MAX_POR_EQUIPO = 9;

// ── El catálogo de un prototipo, como lo arma lib/motor/catalogo.ts ─────────

export type PartidaDelCatalogo = PartidaCotizable & { id: string };

export type PaqueteDelCatalogo = PaqueteCotizable & {
  nivel: number;
  slug: string;
  /** El renglón de Precio vigente que se usó para el precio de conjunto. */
  precioId: string;
};

export type PrototipoCotizable = {
  id: string;
  clave: string;
  superficie: number;
  recamaras: number;
  climasDefault: number;
  partidas: PartidaDelCatalogo[];
  /** Sólo los cerrados que tienen precio vigente en este prototipo. */
  paquetes: PaqueteDelCatalogo[];
};

export type ProyectoCotizable = {
  id: string;
  nombre: string;
  /** Porcentaje de anticipo en puntos base (30 % = 3000), para calcular con enteros. */
  anticipoBP: number;
  minimoPlan: number;
};

export type PaqueteArmable = { id: string; nombre: string; nivel: number; slug: string };

/**
 * Cotiza en el catálogo de un prototipo lo que se eligió: un paquete cerrado
 * (con o sin cambios en su canasta) o, con `paqueteId: null`, «Arma el tuyo».
 * Es el único camino por el que cotizan el sitio, el alta y el motor.
 */
export function cotizarEnCatalogo(
  prototipo: PrototipoCotizable,
  eleccion: { paqueteId: string | null; canasta?: Canasta }
): { cotizacion: Cotizacion; paquete: PaqueteDelCatalogo | null } {
  if (eleccion.paqueteId === null) {
    if (!eleccion.canasta) {
      throw new ReglaError("«Arma el tuyo» necesita la canasta: marca lo que lleva.");
    }
    return {
      cotizacion: cotizar({ partidas: prototipo.partidas, paquete: null, canasta: eleccion.canasta }),
      paquete: null,
    };
  }
  const paquete = prototipo.paquetes.find((p) => p.id === eleccion.paqueteId);
  if (!paquete) {
    throw new ReglaError(
      `No hay precio vigente de ese paquete para el prototipo ${prototipo.clave}. Cárgalo en el proyecto antes de cotizar.`
    );
  }
  return {
    cotizacion: cotizar({
      partidas: prototipo.partidas,
      paquete,
      canasta: eleccion.canasta ?? contenidoComoCanasta(paquete),
    }),
    paquete,
  };
}

/**
 * Cotiza una canasta. Con `paquete` la compara contra lo que el paquete trae
 * para decidir si sigue siendo paquete; sin él, es «Arma el tuyo».
 */
export function cotizar(params: {
  partidas: PartidaCotizable[];
  paquete: PaqueteCotizable | null;
  canasta: Canasta;
}): Cotizacion {
  const { partidas, paquete } = params;
  const porClave = new Map(partidas.map((p) => [p.clave, p]));
  const canasta = validarCanasta(params.canasta, porClave, paquete === null);

  if (paquete === null) {
    const renglones = [...canasta]
      .sort(([a], [b]) => porClave.get(a)!.orden - porClave.get(b)!.orden)
      .map(([clave, cantidad]) => aLista(porClave.get(clave)!, cantidad, "AGREGADA"));
    return resultado("ARMA_EL_TUYO", renglones, null);
  }

  const contenido = validarContenido(paquete, porClave);

  // Por partida: cuánto sale del paquete y cuánto se agrega encima.
  const lineas = ordenar([...new Set([...contenido.keys(), ...canasta.keys()])], porClave).map(
    (clave) => {
      const incluida = contenido.get(clave) ?? 0;
      const pedida = canasta.get(clave) ?? 0;
      return {
        partida: porClave.get(clave)!,
        incluida,
        delPaquete: Math.min(incluida, pedida),
        agregada: Math.max(0, pedida - incluida),
      };
    }
  );

  const quitadas = lineas.filter((l) => l.delPaquete < l.incluida);

  if (quitadas.length === 0) {
    const repartido = repartir(
      paquete.precio,
      lineas.filter((l) => l.delPaquete > 0).map((l) => ({ partida: l.partida, cantidad: l.delPaquete }))
    );
    const renglones = lineas.flatMap((l) => [
      ...(l.delPaquete > 0
        ? [renglon(l.partida, l.delPaquete, repartido.get(l.partida.clave)!, "PAQUETE" as const)]
        : []),
      ...(l.agregada > 0 ? [aLista(l.partida, l.agregada, "AGREGADA")] : []),
    ]);
    return resultado("PAQUETE", renglones, null);
  }

  // Dejó de ser paquete: lo que queda, a lista. El origen se conserva.
  const renglones = lineas.flatMap((l) => [
    ...(l.delPaquete > 0 ? [aLista(l.partida, l.delPaquete, "PAQUETE")] : []),
    ...(l.agregada > 0 ? [aLista(l.partida, l.agregada, "AGREGADA")] : []),
  ]);
  const listaDelPaquete = [...contenido].reduce(
    (acc, [clave, cantidad]) => acc + porClave.get(clave)!.precioLista! * cantidad,
    0
  );
  return resultado("A_LISTA", renglones, {
    paquete: paquete.nombre,
    quitadas: quitadas.map((l) =>
      l.delPaquete > 0
        ? `${l.partida.nombre} (${l.incluida - l.delPaquete} de ${l.incluida})`
        : l.partida.nombre
    ),
    diferencia: listaDelPaquete - paquete.precio,
  });
}

/** La canasta que corresponde a un paquete cerrado sin cambios. */
export function contenidoComoCanasta(paquete: PaqueteCotizable): Canasta {
  return { ...paquete.contenido };
}

/** Spec §4: arranca con clósets y carpintería marcados; los climas, los del prototipo. */
export function canastaInicialArmaElTuyo(partidas: PartidaCotizable[], climasDefault: number): Canasta {
  return Object.fromEntries(
    partidas
      .filter((p) => p.armable && p.precioLista !== null)
      .sort((a, b) => a.orden - b.orden)
      .map((p) => [p.clave, p.porEquipo ? climasDefault : p.porDefecto ? 1 : 0])
  );
}

export function esFinanciable(total: number, minimoPlan: number): boolean {
  return total >= minimoPlan;
}

export function mensajeDebajoDelMinimo(total: number, minimoPlan: number): string {
  return (
    `El total (${mx(total)}) no llega al mínimo para financiar de este proyecto (${mx(minimoPlan)}), ` +
    `así que no se genera plan a 12 meses: se paga de contado en un solo pago. ` +
    `Le faltan ${mx(minimoPlan - total)} para poder pagarlo en mensualidades.`
  );
}

export function avisoPerdidaPaquete(perdida: PerdidaPaquete): string {
  const varias = perdida.quitadas.length > 1;
  const inicio =
    `Al quitar ${enumerar(perdida.quitadas)}, ${perdida.paquete} deja de ser paquete: ` +
    `lo que queda se cobra a precio de lista.`;
  if (perdida.diferencia === 0) {
    return `${inicio} En este departamento no cambia el total: el paquete cuesta lo mismo que sus partidas por separado.`;
  }
  const cuanto = perdida.diferencia > 0 ? "más" : "menos";
  return `${inicio} Pagas ${mx(Math.abs(perdida.diferencia))} ${cuanto} que el precio del paquete sin ${varias ? "esas partidas" : "esa partida"}.`;
}

// ── internos ──────────────────────────────────────────────────────────────

function validarCanasta(
  entrada: Canasta,
  porClave: Map<string, PartidaCotizable>,
  armaElTuyo: boolean
): Map<string, number> {
  const canasta = new Map<string, number>();
  for (const [clave, cantidad] of Object.entries(entrada)) {
    const partida = porClave.get(clave);
    if (!partida) throw new ReglaError(`La partida «${clave}» no está en el catálogo.`);
    if (!Number.isInteger(cantidad) || cantidad < 0) {
      throw new ReglaError(`La cantidad de «${partida.nombre}» no es válida: tiene que ser un número entero, cero o mayor.`);
    }
    if (cantidad === 0) continue;
    if (!partida.porEquipo && cantidad > 1) {
      throw new ReglaError(
        `«${partida.nombre}» va una sola vez por departamento: sólo los climas llevan cantidad.`
      );
    }
    if (partida.porEquipo && cantidad > MAX_POR_EQUIPO) {
      throw new ReglaError(`Se pueden pedir hasta ${MAX_POR_EQUIPO} equipos de «${partida.nombre}».`);
    }
    if (armaElTuyo && !partida.armable) {
      throw new ReglaError(
        `«${partida.nombre}» no se vende en «Arma el tuyo». Si la quiere, elija un paquete cerrado.`
      );
    }
    if (partida.precioLista === null) {
      throw new ReglaError(
        `«${partida.nombre}» no tiene precio de lista para este prototipo. Cárgalo en el catálogo antes de cotizar.`
      );
    }
    canasta.set(clave, cantidad);
  }
  if (canasta.size === 0) throw new ReglaError("La canasta está vacía: marca al menos una partida.");
  return canasta;
}

function validarContenido(
  paquete: PaqueteCotizable,
  porClave: Map<string, PartidaCotizable>
): Map<string, number> {
  const contenido = new Map<string, number>();
  for (const [clave, cantidad] of Object.entries(paquete.contenido)) {
    const partida = porClave.get(clave);
    if (!partida) throw new ReglaError(`El paquete ${paquete.nombre} trae «${clave}», que no está en el catálogo.`);
    if (cantidad <= 0) continue;
    if (partida.precioLista === null) {
      throw new ReglaError(
        `No se puede cotizar ${paquete.nombre}: falta el precio de lista de «${partida.nombre}» en este prototipo, y sin él no se puede repartir el precio del paquete.`
      );
    }
    contenido.set(clave, cantidad);
  }
  if (contenido.size === 0) throw new ReglaError(`El paquete ${paquete.nombre} no trae ninguna partida.`);
  if (!Number.isSafeInteger(paquete.precio) || paquete.precio <= 0) {
    throw new ReglaError(`El precio del paquete ${paquete.nombre} no es válido.`);
  }
  return contenido;
}

/**
 * Reparte el precio de conjunto entre las partidas del paquete, en proporción
 * a su precio de lista y al peso. La última (por orden de catálogo) absorbe
 * el redondeo, igual que la exhibición 12 en el plan (R7): así la suma de los
 * renglones es el precio del paquete, exacto.
 */
function repartir(
  precio: number,
  lineas: { partida: PartidaCotizable; cantidad: number }[]
): Map<string, number> {
  const pesos = lineas.map((l) => l.partida.precioLista! * l.cantidad);
  const total = pesos.reduce((a, b) => a + b, 0);
  if (total <= 0) throw new ReglaError("El paquete no tiene precios de lista con qué repartir su precio.");

  const partes = new Map<string, number>();
  let asignado = 0;
  lineas.forEach((l, i) => {
    const parte =
      i === lineas.length - 1 ? precio - asignado : redondeaDivision(precio * pesos[i], total);
    partes.set(l.partida.clave, parte);
    asignado += parte;
  });
  if ([...partes.values()].some((p) => p <= 0)) {
    throw new Error(`Reparto inválido del paquete: ${JSON.stringify([...partes])}`);
  }
  return partes;
}

/**
 * a / b redondeado a entero, la mitad hacia arriba (como ROUND_HALF_UP y
 * como ROUND de Postgres con positivos). Con enteros, sin punto flotante.
 */
function redondeaDivision(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b <= 0) {
    throw new Error(`redondeaDivision fuera de rango: ${a} / ${b}`);
  }
  return Math.floor((2 * a + b) / (2 * b));
}

function aLista(partida: PartidaCotizable, cantidad: number, origen: Origen): RenglonCotizado {
  return renglon(partida, cantidad, partida.precioLista! * cantidad, origen);
}

function renglon(partida: PartidaCotizable, cantidad: number, importe: number, origen: Origen): RenglonCotizado {
  return {
    clave: partida.clave,
    nombre: partida.nombre,
    familia: partida.familia,
    cantidad,
    precioLista: partida.precioLista!,
    importe,
    origen,
  };
}

function ordenar(claves: string[], porClave: Map<string, PartidaCotizable>): string[] {
  return claves.sort((a, b) => porClave.get(a)!.orden - porClave.get(b)!.orden);
}

function resultado(
  modalidad: Modalidad,
  renglones: RenglonCotizado[],
  perdidaPaquete: PerdidaPaquete | null
): Cotizacion {
  const total = renglones.reduce((acc, r) => acc + r.importe, 0);
  if (!Number.isSafeInteger(total)) throw new Error(`Total fuera de rango: ${total}`);
  return {
    modalidad,
    total,
    renglones,
    perdidaPaquete,
    llevaLevantamiento: renglones.some((r) => r.familia === "A_LA_MEDIDA"),
  };
}

function enumerar(cosas: string[]): string {
  if (cosas.length <= 1) return cosas.join("");
  return `${cosas.slice(0, -1).join(", ")} y ${cosas[cosas.length - 1]}`;
}
