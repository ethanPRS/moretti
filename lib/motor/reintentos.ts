import { reglaDeRechazo } from "./rechazos";

/**
 * Qué hacer después de que el banco rechaza una mensualidad. Lo decide el
 * motor según el código (tabla en rechazos.ts), no la pasarela:
 *
 * - reintentar: el barrido la vuelve a cobrar después de los días de su
 *   regla, uno por rechazo; si se acaban, se pide otra tarjeta.
 * - tarjeta_invalida: no se reintenta y la tarjeta queda marcada para todo el plan.
 * - pedir_tarjeta / pedir_autenticacion / revisar: no se reintenta solo.
 *
 * Si el banco manda `consejo` (advice_code de Stripe) diciendo que no se
 * reintente, se respeta aunque el código diga lo contrario: insistir contra
 * ese aviso le cuesta a la plataforma ante las redes de tarjetas.
 */

export type DecisionRechazo =
  | { tipo: "reintentar"; en: Date; numero: number; de: number }
  | { tipo: "tarjeta_invalida"; motivo: string }
  | { tipo: "pedir_tarjeta"; motivo: string };

const NO_REINTENTAR = new Set(["do_not_try_again", "confirm_card_data"]);

/**
 * @param rechazosConTarjeta los rechazos de esta exhibición con la tarjeta actual, contando este.
 */
export function decidirTrasRechazo(p: {
  codigo: string;
  consejo?: string | null;
  rechazosConTarjeta: number;
  ahora: Date;
}): DecisionRechazo {
  const { explicacion, accion } = reglaDeRechazo(p.codigo);

  if (accion.tipo === "tarjeta_invalida") {
    return { tipo: "tarjeta_invalida", motivo: `${explicacion}: no se le vuelve a cobrar con esa tarjeta` };
  }
  if (p.consejo && NO_REINTENTAR.has(p.consejo)) {
    return { tipo: "pedir_tarjeta", motivo: `el banco pidió no volver a intentar con esta tarjeta (${p.consejo})` };
  }
  switch (accion.tipo) {
    case "pedir_tarjeta":
      return { tipo: "pedir_tarjeta", motivo: `${explicacion}: con esta tarjeta no va a pasar` };
    case "pedir_autenticacion":
      return {
        tipo: "pedir_tarjeta",
        motivo: `${explicacion}; hay que volver a registrar la tarjeta con el comprador presente`,
      };
    case "revisar":
      return {
        tipo: "pedir_tarjeta",
        motivo: `${explicacion} (${p.codigo}); no se reintenta solo: revisarlo en Stripe`,
      };
    case "reintentar": {
      const dias = accion.esperaDias[p.rechazosConTarjeta - 1];
      if (dias === undefined) {
        return {
          tipo: "pedir_tarjeta",
          motivo: `se agotaron los reintentos por ${explicacion} (${accion.esperaDias.length} con esta tarjeta)`,
        };
      }
      return {
        tipo: "reintentar",
        en: new Date(p.ahora.getTime() + dias * 24 * 60 * 60 * 1000),
        numero: p.rechazosConTarjeta,
        de: accion.esperaDias.length,
      };
    }
  }
}
