/**
 * Datos SIMULADOS para la vista de pagos del back office.
 *
 * Mientras Charly conecta Stripe (Sprint 1, actividades K/L/M/N), la vista
 * muestra los cobros reales del motor (tabla Pago, hechos con la pasarela
 * falsa) junto con estos casos inventados, para que se vean todos los estados
 * que la pantalla tiene que saber pintar: rechazos, autenticación pendiente,
 * SPEI, reembolso. Nada de esto toca Stripe ni lleva llaves.
 *
 * Cuando lleguen los webhooks reales, este archivo se borra y la vista lee
 * de las tablas que llene el endpoint.
 */

/** Tarifa de Stripe México, tarjeta nacional, sin IVA (hoja 15 · Tarifas). */
export const STRIPE_PORCENTAJE = 0.036;
export const STRIPE_FIJO = 3;
/** SPEI: fijo por cobro, sin porcentaje. */
export const STRIPE_SPEI = 7;

export function tarifaStripe(monto: number, metodo: Metodo) {
  if (metodo === "spei") return STRIPE_SPEI;
  return Math.round((monto * STRIPE_PORCENTAJE + STRIPE_FIJO) * 100) / 100;
}

export type Metodo = "tarjeta" | "spei";

export type EstadoMovimiento =
  | "exitoso"
  | "rechazado"
  | "requiere_accion"
  | "reembolsado"
  | "en_proceso";

export type Movimiento = {
  id: string;
  fecha: Date;
  comprador: string;
  folio: string;
  unidad: string;
  concepto: string;
  monto: number;
  comision: number;
  metodo: Metodo;
  estado: EstadoMovimiento;
  /** payment_intent de Stripe (o el falso de la pasarela de pruebas). */
  referencia: string;
  /** plan_<planId>:exh_<n>, la llave que evita el doble cobro. */
  llave: string;
  detalle?: string;
  simulado: boolean;
};

export const MOVIMIENTOS_SIMULADOS: Movimiento[] = [
  {
    id: "sim-1",
    fecha: new Date("2026-09-22T10:14:00"),
    comprador: "Rodrigo Garza",
    folio: "DU-002",
    unidad: "BR 1204",
    concepto: "Anticipo",
    monto: 75390,
    comision: 11309,
    metodo: "spei",
    estado: "exitoso",
    referencia: "pi_3Q8sim0SPEI0001",
    llave: "plan_sim2:exh_0:int_1",
    detalle: "Entró por SPEI: $7 fijos en vez de $2,717 con tarjeta.",
    simulado: true,
  },
  {
    id: "sim-2",
    fecha: new Date("2026-09-20T06:00:00"),
    comprador: "Mariana Treviño",
    folio: "DU-003",
    unidad: "BSL 902",
    concepto: "Mensualidad 2 de 12",
    monto: 13119,
    comision: 1968,
    metodo: "tarjeta",
    estado: "rechazado",
    referencia: "pi_3Q8sim0FAIL0002",
    llave: "plan_sim3:exh_2:int_1",
    detalle: "insufficient_funds · reintento programado (política por definir)",
    simulado: true,
  },
  {
    id: "sim-3",
    fecha: new Date("2026-09-18T06:00:00"),
    comprador: "Héctor Villarreal",
    folio: "DU-004",
    unidad: "BR 1205",
    concepto: "Mensualidad 1 de 12",
    monto: 12133,
    comision: 1820,
    metodo: "tarjeta",
    estado: "requiere_accion",
    referencia: "pi_3Q8sim0AUTH0003",
    llave: "plan_sim4:exh_1:int_1",
    detalle: "El banco pidió autenticación: se mandó liga al comprador.",
    simulado: true,
  },
  {
    id: "sim-4",
    fecha: new Date("2026-09-12T13:40:00"),
    comprador: "Paola Cantú",
    folio: "DU-005",
    unidad: "BSL 410",
    concepto: "Anticipo",
    monto: 25740,
    comision: 3861,
    metodo: "tarjeta",
    estado: "reembolsado",
    referencia: "pi_3Q8sim0RFND0004",
    llave: "plan_sim5:exh_0:int_1",
    detalle:
      "Arrepentimiento en 5 días hábiles. refund_application_fee: por decidir (contrato).",
    simulado: true,
  },
];

export type Webhook = {
  id: string;
  tipo: string;
  fecha: Date;
  resultado: "procesado" | "duplicado" | "pendiente";
  nota: string;
};

export const WEBHOOKS_SIMULADOS: Webhook[] = [
  { id: "evt_1Q8sim01", tipo: "payment_intent.succeeded", fecha: new Date("2026-09-22T10:44:00"), resultado: "procesado", nota: "Anticipo DU-002 aplicado · pendiente fiscal creado" },
  { id: "evt_1Q8sim01", tipo: "payment_intent.succeeded", fecha: new Date("2026-09-22T10:44:03"), resultado: "duplicado", nota: "Mismo id de evento: se ignoró, no se aplicó dos veces" },
  { id: "evt_1Q8sim02", tipo: "payment_intent.payment_failed", fecha: new Date("2026-09-20T06:00:12"), resultado: "procesado", nota: "insufficient_funds · se agenda reintento" },
  { id: "evt_1Q8sim03", tipo: "payment_intent.requires_action", fecha: new Date("2026-09-18T06:00:09"), resultado: "pendiente", nota: "Esperando que el comprador autentique" },
  { id: "evt_1Q8sim04", tipo: "charge.refunded", fecha: new Date("2026-09-15T09:02:00"), resultado: "procesado", nota: "Reembolso DU-005 · la comisión de Stripe no regresa" },
  { id: "evt_1Q8sim05", tipo: "account.updated", fecha: new Date("2026-09-10T17:20:00"), resultado: "procesado", nota: "Cuenta de Moretti: charges_enabled = true (prueba)" },
];

/** Las dos cuentas de Connect. Identificadores inventados, modo prueba. */
export const CUENTAS = [
  {
    nombre: "día uno",
    rol: "Plataforma",
    id: "acct_platform_test",
    estado: "Modo prueba",
    nota: "Cobra la comisión del canal como application_fee_amount.",
  },
  {
    nombre: "Moretti",
    rol: "Cuenta conectada · estándar",
    id: "acct_moretti_test",
    estado: "Alta en trámite",
    nota: "Aquí cae el dinero y aquí vive la tarjeta del comprador (por confirmar, Sprint 0 · H).",
  },
];

/** Parámetros de la hoja 15 que siguen abiertos y bloquean pantallas. */
export const PARAMETROS_ABIERTOS = [
  { nombre: "¿Se devuelve la comisión al reembolsar?", quien: "Contrato / abogado", bloquea: "Pantalla de reembolso (U)" },
  { nombre: "Reintentos: cuántos y con qué espaciado", quien: "Operación", bloquea: "Política de reintentos (P)" },
  { nombre: "Qué códigos de rechazo se reintentan", quien: "Operación", bloquea: "Política de reintentos (P)" },
];
