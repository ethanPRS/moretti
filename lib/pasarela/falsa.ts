import type { Pasarela, SolicitudCobro, ResultadoCobro } from "./contrato";

/**
 * Simula la pasarela: todo cobro sale exitoso, al instante, sin llamar
 * a Stripe. Para que el motor se programe y pruebe sin esperar a la
 * integración real.
 *
 * Reemplázala por lib/pasarela/stripe.ts en lib/pasarela/index.ts
 * cuando la integración real esté lista.
 */
export const pasarelaFalsa: Pasarela = {
  async cobrar(solicitud: SolicitudCobro): Promise<ResultadoCobro> {
    return {
      exitoso: true,
      referenciaPasarela: `falso_plan_${solicitud.planId}_exh_${solicitud.numeroExhibicion}_int_${solicitud.intento}`,
    };
  },
};
