"use client";

import { FormEvent, useState } from "react";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

type PaymentFormProps = {
  clientSecret: string;
  onConfirmed: () => void;
};

export default function CobrarButton({
  exhibicionId,
  esAnticipo,
  bloqueado,
}: {
  exhibicionId: string;
  esAnticipo: boolean;
  bloqueado: boolean;
}) {
  const router = useRouter();
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function prepararPago() {
    setError(null);
    setCargando(true);

    try {
      if (!publishableKey.startsWith("pk_test_")) {
        throw new Error("Falta la llave publicable de prueba de Stripe.");
      }

      const response = await fetch("/api/stripe/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exhibicionId }),
      });
      const data = (await response.json()) as {
        clientSecret?: string;
        stripeAccountId?: string;
        error?: string;
      };

      if (!response.ok || !data.clientSecret || !data.stripeAccountId) {
        throw new Error(data.error ?? "No se pudo preparar el cobro.");
      }

      setStripePromise(loadStripe(publishableKey, { stripeAccount: data.stripeAccountId }));
      setClientSecret(data.clientSecret);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "No se pudo preparar el cobro.");
    } finally {
      setCargando(false);
    }
  }

  function closeForm() {
    setClientSecret(null);
    setStripePromise(null);
    setError(null);
  }

  return (
    <div className="flex min-w-[270px] flex-col items-end gap-2">
      {!clientSecret && (
        <button onClick={prepararPago} disabled={cargando || bloqueado} className="btn btn-sm">
          {cargando ? "Preparando…" : esAnticipo ? "Cobrar anticipo" : "Cobrar"}
        </button>
      )}
      {clientSecret && stripePromise && (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <PaymentForm clientSecret={clientSecret} onConfirmed={() => router.refresh()} />
        </Elements>
      )}
      {clientSecret && (
        <button type="button" className="text-xs text-muted hover:text-ink" onClick={closeForm}>
          Cancelar
        </button>
      )}
      {error && <span className="max-w-[34ch] text-right text-[12px] text-warm">{error}</span>}
    </div>
  );
}

function PaymentForm({ clientSecret, onConfirmed }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [esperandoWebhook, setEsperandoWebhook] = useState(false);

  async function confirmar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!stripe || !elements) {
      setError("Stripe todavía está cargando.");
      return;
    }

    const card = elements.getElement(CardElement);
    if (!card) {
      setError("No se pudo cargar el formulario seguro de tarjeta.");
      return;
    }

    setCargando(true);
    const result = await stripe.confirmCardPayment(clientSecret, { payment_method: { card } });
    setCargando(false);

    if (result.error) {
      setError(result.error.message ?? "Stripe rechazó el pago.");
      return;
    }

    if (result.paymentIntent?.status === "succeeded" || result.paymentIntent?.status === "processing") {
      setEsperandoWebhook(true);
      window.setTimeout(onConfirmed, 1200);
      return;
    }

    setError("Stripe no confirmó este pago.");
  }

  return (
    <form onSubmit={confirmar} className="w-full max-w-[330px] rounded-[var(--r-input)] border border-line-2 bg-surface p-3">
      <p className="mb-2 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        Tarjeta de prueba
      </p>
      <div className="rounded-[var(--r-input)] border border-line-2 px-3 py-2.5">
        <CardElement
          options={{
            style: {
              base: {
                color: "#23211e",
                fontFamily: "Poppins, Helvetica Neue, Arial, sans-serif",
                fontSize: "14px",
                "::placeholder": { color: "#807a72" },
              },
              invalid: { color: "#b4643c" },
            },
          }}
        />
      </div>
      <p className="mt-2 text-left text-[11px] text-muted">4242 4242 4242 4242 · fecha futura · 123</p>
      {error && <p className="mt-2 text-left text-xs text-warm" role="alert">{error}</p>}
      <button type="submit" className="btn btn-sm mt-3 w-full" disabled={cargando || esperandoWebhook}>
        {esperandoWebhook ? "Esperando confirmación…" : cargando ? "Confirmando…" : "Confirmar cobro"}
      </button>
    </form>
  );
}
