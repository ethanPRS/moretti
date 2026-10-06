import type { Pasarela } from "./contrato";
import { pasarelaFalsa } from "./falsa";
// Cuando Charly termine la integración real, descomenta esta línea:
// import { pasarelaStripe } from "./stripe";

/**
 * Único lugar del repo donde se decide qué pasarela usa el motor.
 * Todo lo demás importa `pasarela` de aquí, nunca de "./falsa" ni
 * "./stripe" directamente. (Las pruebas y el seed sí crean su propia
 * pasarela falsa y se la pasan al motor.)
 */
export const pasarela: Pasarela = pasarelaFalsa;
// export const pasarela: Pasarela = pasarelaStripe;

export type {
  Pasarela,
  SolicitudCobro,
  ResultadoCobro,
  SolicitudTarjeta,
  PreparacionTarjeta,
} from "./contrato";
export { llaveIdempotencia } from "./contrato";
