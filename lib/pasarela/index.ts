import type { Pasarela } from "./contrato";
import { pasarelaFalsa } from "./falsa";
import { pasarelaStripe } from "./stripe";

/**
 * Único lugar del repo donde se decide qué pasarela usa el motor.
 * Todo lo demás importa `pasarela` de aquí, nunca de "./falsa" ni
 * "./stripe" directamente. (Las pruebas y el seed sí crean su propia
 * pasarela falsa y se la pasan al motor.)
 *
 * Con una llave secreta de prueba (sk_test_) en el entorno se cobra con
 * Stripe; sin ella, con la falsa, para que el prototipo siga corriendo en
 * una máquina sin llaves. Llaves de producción: no se aceptan todavía.
 */
export const pasarela: Pasarela = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
  ? pasarelaStripe
  : pasarelaFalsa;

export type {
  Pasarela,
  SolicitudCobro,
  ResultadoCobro,
  SolicitudTarjeta,
  PreparacionTarjeta,
  SolicitudConfirmarTarjeta,
  TarjetaConfirmada,
  AccionComprador,
  SolicitudReembolso,
  ReembolsoHecho,
  SolicitudAutorizacion,
} from "./contrato";
export { llaveIdempotencia, llaveReembolso } from "./contrato";
