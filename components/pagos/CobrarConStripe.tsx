"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { prepararIntentoStripe } from "@/lib/pasarela/cliente";

export type EstadoPagoNavegador =
  | "sin-configuracion"
  | "cargando"
  | "listo"
  | "enviando"
  | "autenticacion-requerida"
  | "procesando"
  | "pendiente-confirmacion"
  | "confirmado-servidor"
  | "rechazado";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export default function CobrarConStripe({
  exhibicionId,
  esAnticipo,
  bloqueado,
  stripeTestConfigurado,
  bloqueoCobro,
}: {
  exhibicionId: string;
  esAnticipo: boolean;
  bloqueado: boolean;
  stripeTestConfigurado: boolean;
  bloqueoCobro: string;
}) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoPagoNavegador>(
    stripeTestConfigurado && PUBLIC_KEY.startsWith("pk_test_") ? "listo" : "sin-configuracion"
  );
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function prepararPago() {
    if (!stripeTestConfigurado || !PUBLIC_KEY.startsWith("pk_test_")) {
      setEstado("sin-configuracion");
      setError("Falta configurar una llave publicable pk_test_ de Stripe.");
      return;
    }
    if (controller.current) return;

    const abortController = new AbortController();
    controller.current = abortController;
    setEstado("cargando");
    setError(null);

    try {
      const intento = await prepararIntentoStripe(exhibicionId, abortController.signal);
      setStripePromise(loadStripe(PUBLIC_KEY, { stripeAccount: intento.stripeAccountId }));
      setClientSecret(intento.clientSecret);
      setEstado("listo");
    } catch (prepareError) {
      if (!abortController.signal.aborted) {
        setEstado("rechazado");
        setError(
          prepareError instanceof Error
            ? prepareError.message
            : "No se pudo preparar el pago. Puedes volver a intentarlo."
        );
      }
    } finally {
      if (controller.current === abortController) controller.current = null;
    }
  }

  return (
    <div className="flex min-w-[250px] flex-col items-start gap-2">
      {!clientSecret && (
        <button
          type="button"
          onClick={prepararPago}
          disabled={bloqueado || estado === "cargando" || !stripeTestConfigurado || !PUBLIC_KEY.startsWith("pk_test_")}
          className="btn btn-sm"
        >
          {estado === "cargando" ? "Preparando…" : esAnticipo ? "Preparar pago de prueba" : "Preparar cobro"}
        </button>
      )}
      {(!stripeTestConfigurado || !PUBLIC_KEY.startsWith("pk_test_")) && (
        <p className="text-xs text-ink-2" role="status">
          Configuración de Stripe de prueba pendiente. No se habilitan operaciones.
        </p>
      )}
      {clientSecret && stripePromise && (
        <Elements stripe={stripePromise} options={{ clientSecret, locale: "es-419" }}>
          <PaymentForm
            bloqueoCobro={bloqueoCobro}
            onEstado={setEstado}
            onError={setError}
          />
        </Elements>
      )}
      {clientSecret && !stripePromise && (
        <p className="note blocked" role="alert">Stripe no pudo inicializarse con la cuenta conectada.</p>
      )}
      {clientSecret && (
        <p className="text-xs text-ink-2" role="status" aria-live="polite">
          {estado === "listo" && "Payment Element seguro listo · ambiente de prueba."}
          {estado === "enviando" && "Enviando confirmación a Stripe…"}
          {estado === "autenticacion-requerida" && "Tu banco requiere autenticación. Completa el paso seguro de Stripe."}
          {estado === "procesando" && "Stripe está procesando el pago. No vuelvas a enviarlo."}
          {estado === "pendiente-confirmacion" && "Stripe respondió; falta la confirmación del servidor."}
          {estado === "confirmado-servidor" && "El servidor confirmó el pago."}
          {estado === "rechazado" && "El intento fue rechazado. Revisa el mensaje antes de reintentar."}
          {estado === "sin-configuracion" && "Configuración de prueba pendiente."}
          {estado === "cargando" && "Preparando el formulario seguro…"}
        </p>
      )}
      {bloqueado && <p className="text-xs text-warm">El contrato firmado es requisito para cobrar el anticipo.</p>}
      {error && <p className="max-w-[36ch] text-xs text-warm" role="alert">{error}</p>}
      {(estado === "pendiente-confirmacion" || estado === "procesando" || estado === "autenticacion-requerida") && (
        <p className="text-xs text-ink-2" role="status">
          El webhook es la fuente de verdad. Esta pantalla no dispone de una consulta de estado del pago.
        </p>
      )}
    </div>
  );
}

function PaymentForm({
  bloqueoCobro,
  onEstado,
  onError,
}: {
  bloqueoCobro: string;
  onEstado: (estado: EstadoPagoNavegador) => void;
  onError: (error: string | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [consentimiento, setConsentimiento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [esperandoConfirmacion, setEsperandoConfirmacion] = useState(false);
  const enviandoRef = useRef(false);

  async function confirmar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements || enviandoRef.current || !consentimiento || bloqueoCobro) return;

    enviandoRef.current = true;
    setEnviando(true);
    onError(null);
    onEstado("enviando");

    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });

      if (result.error) {
        const esRechazo = result.error.type === "card_error" || result.error.type === "validation_error";
        setEsperandoConfirmacion(!esRechazo);
        onEstado(esRechazo ? "rechazado" : "pendiente-confirmacion");
        onError(result.error.message ?? "No se pudo confirmar el pago con Stripe.");
        return;
      }

      switch (result.paymentIntent?.status) {
        case "succeeded":
          setEsperandoConfirmacion(true);
          onEstado("pendiente-confirmacion");
          router.refresh();
          return;
        case "processing":
          setEsperandoConfirmacion(true);
          onEstado("procesando");
          return;
        case "requires_action":
          setEsperandoConfirmacion(true);
          onEstado("autenticacion-requerida");
          return;
        case "requires_payment_method":
          setEsperandoConfirmacion(false);
          onEstado("rechazado");
          onError("Stripe no aceptó el método de pago. Revisa los datos o usa otra tarjeta.");
          return;
        default:
          setEsperandoConfirmacion(true);
          onEstado("pendiente-confirmacion");
      }
    } catch {
      setEsperandoConfirmacion(true);
      onEstado("pendiente-confirmacion");
      onError("No se recibió respuesta de Stripe. No vuelvas a enviar el pago; falta consultar el estado en el servidor.");
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={confirmar} className="w-full max-w-[460px] space-y-4">
      <div className="rounded-[var(--r-input)] border border-line-2 bg-surface p-4">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>
      <label className="flex items-start gap-3 text-sm text-ink-2">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-[var(--accent)]"
          checked={consentimiento}
          onChange={(event) => setConsentimiento(event.target.checked)}
        />
        Autorizo explícitamente los cargos futuros de las mensualidades del plan a la tarjeta registrada.
      </label>
      {bloqueoCobro && <p className="note blocked" role="status">{bloqueoCobro}</p>}
      <button
        type="submit"
        className="btn btn-sm"
        disabled={!stripe || !consentimiento || enviando || esperandoConfirmacion || Boolean(bloqueoCobro)}
      >
        {enviando ? "Enviando a Stripe…" : "Confirmar pago"}
      </button>
    </form>
  );
}