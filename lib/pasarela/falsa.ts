import {
  llaveIdempotencia,
  llaveReembolso,
  type Pasarela,
  type PreparacionTarjeta,
  type ReembolsoHecho,
  type ResultadoCobro,
  type SolicitudAutorizacion,
  type SolicitudCobro,
  type SolicitudConfirmarTarjeta,
  type SolicitudReembolso,
  type SolicitudTarjeta,
  type TarjetaConfirmada,
} from "./contrato";

/**
 * Simula la pasarela sin llamar a Stripe, para que el motor se programe y se
 * pruebe sin esperar a la integración real.
 *
 * Se porta como Stripe en lo que al motor le importa: la misma llave devuelve
 * la misma respuesta (incluido un rechazo) y no genera un cargo nuevo; la
 * misma llave con otro monto es un error. Por defecto todo cobro sale
 * exitoso; `decidir` permite simular rechazos y autenticaciones.
 */
export type PasarelaFalsa = Pasarela & {
  /** Los cargos que sí se hicieron, uno por llave exitosa. Para las pruebas. */
  readonly cargos: ReadonlyArray<{ llave: string; solicitud: SolicitudCobro }>;
  /** Cuántas veces se llamó `cobrar`, contando repeticiones de la misma llave. */
  readonly llamadas: number;
  /** Los reembolsos que sí se hicieron, uno por llave. */
  readonly reembolsos: ReadonlyArray<{ llave: string; solicitud: SolicitudReembolso }>;
};

export function crearPasarelaFalsa(opciones?: {
  decidir?: (solicitud: SolicitudCobro) => ResultadoCobro;
}): PasarelaFalsa {
  const respuestas = new Map<string, { solicitud: SolicitudCobro; resultado: ResultadoCobro }>();
  const cargos: { llave: string; solicitud: SolicitudCobro }[] = [];
  const reembolsos = new Map<string, { llave: string; solicitud: SolicitudReembolso }>();
  let llamadas = 0;

  return {
    get cargos() {
      return cargos;
    },
    get llamadas() {
      return llamadas;
    },
    get reembolsos() {
      return [...reembolsos.values()];
    },

    async cobrar(solicitud: SolicitudCobro): Promise<ResultadoCobro> {
      llamadas++;
      validarCentavos(solicitud);
      const llave = llaveIdempotencia(solicitud);

      const previa = respuestas.get(llave);
      if (previa) {
        if (
          previa.solicitud.montoCentavos !== solicitud.montoCentavos ||
          previa.solicitud.comisionCentavos !== solicitud.comisionCentavos
        ) {
          // Stripe contesta igual: una llave sólo sirve con los mismos parámetros.
          throw new Error(`La llave ${llave} ya se usó con otros montos.`);
        }
        return previa.resultado;
      }

      const resultado = opciones?.decidir?.(solicitud) ?? {
        estado: "exitoso" as const,
        referenciaPasarela: `falso_${llave}`,
      };
      respuestas.set(llave, { solicitud, resultado });
      if (resultado.estado === "exitoso") cargos.push({ llave, solicitud });
      return resultado;
    },

    async prepararTarjeta(solicitud: SolicitudTarjeta): Promise<PreparacionTarjeta> {
      return { clientSecret: `falso_seti_${solicitud.compradorId}_secret` };
    },

    async confirmarTarjeta(solicitud: SolicitudConfirmarTarjeta): Promise<TarjetaConfirmada> {
      return { referenciaTarjeta: `falso_pm_${solicitud.compradorId}`, descripcion: "tarjeta de prueba 4242" };
    },

    async reembolsar(solicitud: SolicitudReembolso): Promise<ReembolsoHecho> {
      const llave = llaveReembolso(solicitud);
      if (!reembolsos.has(llave)) reembolsos.set(llave, { llave, solicitud });
      const hecho = reembolsos.get(llave)!.solicitud;
      return { referenciaReembolso: `falso_re_${llave}`, montoCentavos: hecho.montoCentavos };
    },

    async capturar(solicitud: SolicitudAutorizacion): Promise<ResultadoCobro> {
      return { estado: "exitoso", referenciaPasarela: solicitud.referenciaPasarela };
    },

    async liberar(): Promise<void> {},
  };
}

/** Un rechazo del banco, con el código que mandaría Stripe. */
export function rechazo(codigoRechazo: string, reintentar = false): ResultadoCobro {
  return {
    estado: "rechazado",
    codigoRechazo,
    mensaje: `El banco rechazó el cargo (${codigoRechazo}).`,
    reintentar,
  };
}

function validarCentavos(s: SolicitudCobro) {
  for (const [campo, valor] of [
    ["montoCentavos", s.montoCentavos],
    ["comisionCentavos", s.comisionCentavos],
  ] as const) {
    if (!Number.isSafeInteger(valor) || valor < 0) {
      throw new Error(`${campo} tiene que ser un entero de centavos, llegó ${valor}.`);
    }
  }
  if (s.comisionCentavos > s.montoCentavos) {
    throw new Error("La comisión no puede ser mayor que el cobro.");
  }
}

/** La que usa el prototipo mientras no esté la de Stripe: todo sale exitoso. */
export const pasarelaFalsa: PasarelaFalsa = crearPasarelaFalsa();
