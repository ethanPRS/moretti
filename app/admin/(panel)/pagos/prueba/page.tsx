"use client";

import { FormEvent, useState } from "react";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Money, PageHead } from "@/components/ui";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = publishableKey.startsWith("pk_test_")
  ? loadStripe(publishableKey)
  : null;

export default function PruebaPagosPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHead
        eyebrow="Stripe · ambiente de pruebas"
        titulo="Cobrar un anticipo"
        descripcion="Confirma un PaymentIntent de Stripe en modo sandbox. No se realizará ningún cargo real."
      />

      {!stripePromise ? (
        <div className="note blocked" role="alert">
          Configura una llave publicable de Stripe de prueba en
          <code className="mx-1 font-mono text-xs">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>
          . Debe comenzar con <code className="font-mono text-xs">pk_test_</code>.
        </div>
      ) : (
        <Elements stripe={stripePromise}>
          <CheckoutForm />
        </Elements>
      )}
    </div>
  );
}

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [email, setEmail] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!stripe || !elements) {
      setError("Stripe todavía está cargando. Inténtalo de nuevo en un momento.");
      return;
    }

    if (!email) {
      setError("Escribe un correo para recibir el comprobante de prueba.");
      return;
    }

    const card = elements.getElement(CardElement);
    if (!card) {
      setError("No se pudo cargar el formulario seguro de tarjeta.");
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch("/api/stripe/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json()) as { clientSecret?: string; error?: string };

      if (!response.ok || !data.clientSecret) {
        throw new Error(data.error ?? "No se pudo preparar el pago de prueba.");
      }

      const result = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: {
          card,
          billing_details: { email },
        },
      });

      if (result.error) {
        throw new Error(result.error.message ?? "Stripe rechazó el pago de prueba.");
      }

      if (result.paymentIntent?.status !== "succeeded") {
        throw new Error("El pago no terminó correctamente.");
      }

      setPaymentIntentId(result.paymentIntent.id);
      setIsPaid(true);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "No se pudo confirmar el pago.");
    } finally {
      setIsProcessing(false);
    }
  }

  function resetPayment() {
    setEmail("");
    setIsPaid(false);
    setPaymentIntentId("");
    setError("");
    elements?.getElement(CardElement)?.clear();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <section className="card p-6 sm:p-8" aria-labelledby="checkout-title">
        {isPaid ? (
          <div className="flex flex-col gap-5 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-xl text-accent">
              ✓
            </div>
            <div>
              <p className="eyebrow">Pago aprobado por Stripe</p>
              <h2 id="checkout-title" className="mt-2 text-[28px]">
                El anticipo está registrado
              </h2>
              <p className="mt-3 text-ink-2">La tarjeta de prueba fue confirmada en sandbox.</p>
            </div>
            <div className="border-t border-line pt-4 text-sm text-ink-2">
              <div className="flex justify-between gap-4">
                <span>PaymentIntent</span>
                <span className="max-w-[220px] truncate font-mono text-xs text-ink">
                  {paymentIntentId}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <span>Importe</span>
                <strong className="text-ink">
                  <Money valor={12500} conCentavos />
                </strong>
              </div>
            </div>
            <button type="button" className="btn btn-ghost self-start" onClick={resetPayment}>
              Simular otro pago
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
              <div>
                <p className="label">Método de pago</p>
                <h2 id="checkout-title" className="mt-1 text-[24px]">
                  Tarjeta de crédito o débito
                </h2>
              </div>
              <span className="rounded-full bg-surface-2 px-3 py-1 font-mono text-[11px] text-muted">
                TEST
              </span>
            </div>

            <div className="mt-6 flex flex-col gap-5">
              <div className="field">
                <label htmlFor="card-element">Datos de tarjeta</label>
                <div className="rounded-[var(--r-input)] border border-line-2 bg-surface px-3.5 py-[13px]">
                  <CardElement
                    id="card-element"
                    options={{
                      style: {
                        base: {
                          color: "#23211e",
                          fontFamily: "Poppins, Helvetica Neue, Arial, sans-serif",
                          fontSize: "15px",
                          "::placeholder": { color: "#807a72" },
                        },
                        invalid: { color: "#b4643c" },
                      },
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted">
                  Tarjeta de prueba: 4242 4242 4242 4242 · cualquier fecha futura · CVC 123
                </p>
              </div>

              <div className="field">
                <label htmlFor="email">Correo para el recibo</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@ejemplo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <p className="mt-5 rounded-[var(--r-input)] bg-warm-soft px-4 py-3 text-sm text-warm" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-warm mt-6 w-full" disabled={isProcessing || !stripe}>
              {isProcessing ? "Confirmando con Stripe..." : "Pagar anticipo"}
            </button>
            <p className="mt-4 text-center text-xs text-muted">
              Stripe sandbox · no se realizará ningún cargo real
            </p>
          </form>
        )}
      </section>

      <aside className="card bg-surface-2 p-6" aria-label="Resumen del pago">
        <p className="label">Resumen</p>
        <div className="mt-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px]">Plan Moretti 204</h2>
            <p className="mt-1 text-sm text-ink-2">Anticipo de instalación</p>
          </div>
          <span className="chip info">1 de 13</span>
        </div>
        <div className="mt-7 border-t border-line-2 pt-5">
          <div className="flex items-end justify-between gap-4">
            <span className="text-sm text-ink-2">Total a pagar</span>
            <strong className="figure text-[26px]">
              <Money valor={12500} conCentavos />
            </strong>
          </div>
          <p className="mt-2 text-right text-xs text-muted">MXN · IVA incluido</p>
        </div>
      </aside>
    </div>
  );
}
