export type IntentoStripePreparado = {
  clientSecret: string;
  stripeAccountId: string;
  intentoId: string;
};

// Sólo existe la preparación del intent; no hay GET de estado para consultar el resultado del webhook.
export async function prepararIntentoStripe(
  exhibicionId: string,
  signal?: AbortSignal
): Promise<IntentoStripePreparado> {
  const response = await fetch("/api/stripe/create-payment-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exhibicionId }),
    signal,
  });
  const data = (await response.json().catch(() => ({}))) as Partial<IntentoStripePreparado> & {
    error?: string;
  };

  if (!response.ok || !data.clientSecret || !data.stripeAccountId || !data.intentoId) {
    throw new Error(data.error ?? "No se pudo preparar el pago de prueba.");
  }

  return {
    clientSecret: data.clientSecret,
    stripeAccountId: data.stripeAccountId,
    intentoId: data.intentoId,
  };
}