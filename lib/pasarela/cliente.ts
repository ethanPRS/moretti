/**
 * Lo que llama el navegador para guardar la tarjeta y cobrar el anticipo.
 * Sólo habla con nuestras rutas: nunca con Stripe directo, salvo los
 * componentes de Stripe que capturan la tarjeta y autentican con el banco.
 */

export type AccionComprador = { clientSecret: string; cuentaConectada: string };

export type RespuestaCobro =
  | { estado: "exitoso"; referencia: string }
  | { estado: "pendiente"; referencia: string; mensaje: string; accion: AccionComprador | null }
  | { estado: "rechazado"; mensaje: string };

export type EstadoCobro = { pagada: boolean; referencia: string | null; intentosRechazados: number };

async function pedir<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as Partial<T> & { error?: string };
  return { status: response.status, ok: response.ok, data };
}

/** Pide el secreto del SetupIntent. `consentimiento` es la casilla de los cargos futuros. */
export async function prepararTarjeta(planId: string, consentimiento: boolean, signal?: AbortSignal) {
  const { ok, data } = await pedir<{ clientSecret: string }>(`/api/planes/${planId}/tarjeta`, {
    method: "POST",
    body: JSON.stringify({ consentimiento }),
    signal,
  });
  if (!ok || !data.clientSecret) throw new Error(data.error ?? "No se pudo preparar la captura de la tarjeta.");
  return data.clientSecret;
}

/** El servidor verifica con Stripe que la tarjeta sí quedó guardada. */
export async function confirmarTarjeta(planId: string, setupIntentId: string) {
  const { ok, data } = await pedir<{ descripcion: string }>(`/api/planes/${planId}/tarjeta/confirmar`, {
    method: "POST",
    body: JSON.stringify({ setupIntentId }),
  });
  if (!ok) throw new Error(data.error ?? "No se pudo verificar la tarjeta.");
  return data.descripcion ?? "tarjeta";
}

/** Cobra el anticipo a la tarjeta registrada. Una regla o la red lanzan; el banco contesta. */
export async function cobrarAnticipo(planId: string): Promise<RespuestaCobro> {
  const { status, data } = await pedir<{
    referencia: string;
    mensaje: string;
    accion: AccionComprador | null;
  }>("/api/apartar/anticipo", { method: "POST", body: JSON.stringify({ planId }) });

  if (status === 200) return { estado: "exitoso", referencia: data.referencia ?? "" };
  if (status === 202) {
    return {
      estado: "pendiente",
      referencia: data.referencia ?? "",
      mensaje: data.mensaje ?? "El cobro quedó pendiente.",
      accion: data.accion ?? null,
    };
  }
  if (status === 402) return { estado: "rechazado", mensaje: data.error ?? "El banco rechazó el cobro." };
  throw new Error(data.error ?? "No se pudo cobrar el anticipo.");
}

/** Lo que el servidor sabe del cobro. El webhook es la fuente de verdad. */
export async function consultarEstado(exhibicionId: string): Promise<EstadoCobro> {
  const { ok, data } = await pedir<EstadoCobro>(`/api/exhibiciones/${exhibicionId}/estado`);
  if (!ok) throw new Error(data.error ?? "No se pudo consultar el cobro.");
  return {
    pagada: data.pagada === true,
    referencia: data.referencia ?? null,
    intentosRechazados: data.intentosRechazados ?? 0,
  };
}
