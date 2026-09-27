import type { Pasarela } from "./contrato";
import { pasarelaFalsa } from "./falsa";
// Cuando Charly termine la integración real, descomenta esta línea:
// import { pasarelaStripe } from "./stripe";

/**
 * Único lugar del repo donde se decide qué pasarela usa el motor.
 * Todo lo demás importa `pasarela` de aquí, nunca de "./falsa" ni
 * "./stripe" directamente.
 */
export const pasarela: Pasarela = pasarelaFalsa;
// export const pasarela: Pasarela = pasarelaStripe;

export type { Pasarela, SolicitudCobro, ResultadoCobro } from "./contrato";
