"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import {
  cobrarAnticipo,
  confirmarTarjeta,
  consultarEstado,
  prepararTarjeta,
  type AccionComprador,
} from "@/lib/pasarela/cliente";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const LLAVE_DE_PRUEBA = PUBLIC_KEY.startsWith("pk_test_");

// La tarjeta se captura en la plataforma (D-02), sin cuenta conectada.
let plataforma: Promise<Stripe | null> | null = null;
const stripePlataforma = () => (plataforma ??= loadStripe(PUBLIC_KEY));

/** Cuánto se espera al webhook antes de dejar de preguntar: 30 × 2 s. */
const VUELTAS = 30;
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Fase =
  | { id: "inicio" }
  | { id: "preparando" }
  | { id: "captura"; clientSecret: string }
  | { id: "cobrando" }
  | { id: "autenticando" }
  | { id: "esperando" }
  | { id: "pagado"; referencia: string | null }
  | { id: "sin-confirmar" };

/**
 * El anticipo con el comprador presente (S1-06, S1-07):
 * 1. autoriza los cargos futuros y captura su tarjeta (SetupIntent en la plataforma);
 * 2. el servidor verifica que quedó guardada y cobra el anticipo con ella;
 * 3. si el banco pide autenticación, el comprador la hace aquí;
 * 4. el pago lo aplica el webhook: esta pantalla sólo pregunta hasta verlo.
 */
export default function CobrarConStripe({
  planId,
  exhibicionId,
  bloqueado,
  stripeTestConfigurado,
  tarjetaRegistrada,
  onPagado,
}: {
  planId: string;
  /** La exhibición del anticipo, para consultar si ya quedó pagada. */
  exhibicionId: string;
  bloqueado: boolean;
  stripeTestConfigurado: boolean;
  /** «visa terminación 4242» si el comprador ya registró una; null si no. */
  tarjetaRegistrada: string | null;
  onPagado?: () => void;
}) {
  const router = useRouter();
  const configurado = stripeTestConfigurado && LLAVE_DE_PRUEBA;
  const [fase, setFase] = useState<Fase>({ id: "inicio" });
  const [consentimiento, setConsentimiento] = useState(false);
  const [tarjeta, setTarjeta] = useState(tarjetaRegistrada);
  const [otraTarjeta, setOtraTarjeta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  function fallar(err: unknown, porDefecto: string) {
    if (!vivo.current) return;
    setError(err instanceof Error ? err.message : porDefecto);
    setFase({ id: "inicio" });
  }

  function terminar(referencia: string | null) {
    if (!vivo.current) return;
    setFase({ id: "pagado", referencia });
    onPagado?.();
    router.refresh();
  }

  async function prepararCaptura() {
    setError(null);
    setFase({ id: "preparando" });
    try {
      setFase({ id: "captura", clientSecret: await prepararTarjeta(planId, consentimiento) });
    } catch (err) {
      fallar(err, "No se pudo preparar la captura de la tarjeta.");
    }
  }

  async function tarjetaGuardada(setupIntentId: string) {
    try {
      const descripcion = await confirmarTarjeta(planId, setupIntentId);
      setTarjeta(descripcion);
      setOtraTarjeta(false);
      await cobrar();
    } catch (err) {
      fallar(err, "No se pudo verificar la tarjeta.");
    }
  }

  async function cobrar() {
    setError(null);
    setFase({ id: "cobrando" });
    try {
      // Para saber después si el webhook anotó un rechazo nuevo.
      const antes = (await consultarEstado(exhibicionId)).intentosRechazados;
      const r = await cobrarAnticipo(planId);

      if (r.estado === "exitoso") return terminar(r.referencia);
      if (r.estado === "rechazado") return fallar(new Error(`${r.mensaje} Puedes usar otra tarjeta.`), "");

      if (r.accion) {
        setFase({ id: "autenticando" });
        const problema = await autenticar(r.accion);
        // Si no se autenticó, Stripe manda payment_failed y el webhook lo anota:
        // se espera a verlo para que el siguiente intento vaya con llave nueva.
        if (problema && vivo.current) setError(problema);
      }
      await esperarWebhook(antes);
    } catch (err) {
      fallar(err, "No se pudo cobrar el anticipo.");
    }
  }

  async function esperarWebhook(rechazosAntes: number) {
    if (!vivo.current) return;
    setFase({ id: "esperando" });
    for (let i = 0; i < VUELTAS && vivo.current; i++) {
      await pausa(2000);
      try {
        const e = await consultarEstado(exhibicionId);
        if (e.pagada) return terminar(e.referencia);
        if (e.intentosRechazados > rechazosAntes) {
          return fallar(new Error("El banco no autorizó el cargo. Puedes intentar de nuevo o usar otra tarjeta."), "");
        }
      } catch {
        // Un tropiezo de red no cambia nada: se vuelve a preguntar.
      }
    }
    if (vivo.current) setFase({ id: "sin-confirmar" });
  }

  if (!configurado) {
    return (
      <p className="text-xs text-ink-2" role="status">
        Configuración de Stripe de prueba pendiente (pk_test_ y sk_test_). No se habilitan cobros.
      </p>
    );
  }

  const ocupado = ["preparando", "cobrando", "autenticando", "esperando"].includes(fase.id);

  return (
    <div className="flex w-full max-w-[460px] flex-col items-start gap-3">
      {fase.id === "inicio" && tarjeta && !otraTarjeta && (
        <>
          <p className="text-sm text-ink-2">Se cobra a la {tarjeta} del comprador.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-sm" onClick={cobrar} disabled={bloqueado}>
              Cobrar anticipo
            </button>
            <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setOtraTarjeta(true)}>
              Usar otra tarjeta
            </button>
          </div>
        </>
      )}

      {fase.id === "inicio" && (!tarjeta || otraTarjeta) && (
        <>
          <label className="flex items-start gap-3 text-sm text-ink-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--accent)]"
              checked={consentimiento}
              onChange={(e) => setConsentimiento(e.target.checked)}
            />
            Autorizo que en esta tarjeta se cobre el anticipo y, después, cada mensualidad del plan en su
            fecha, sin que tenga que estar presente.
          </label>
          <button
            type="button"
            className="btn btn-sm"
            onClick={prepararCaptura}
            disabled={bloqueado || !consentimiento}
          >
            Capturar tarjeta
          </button>
        </>
      )}

      {fase.id === "captura" && (
        <Elements stripe={stripePlataforma()} options={{ clientSecret: fase.clientSecret, locale: "es-419" }}>
          <FormularioTarjeta
            onGuardada={tarjetaGuardada}
            onError={(mensaje) => setError(mensaje)}
            onCancelar={() => {
              setError(null);
              setFase({ id: "inicio" });
            }}
          />
        </Elements>
      )}

      {ocupado && (
        <p className="text-sm text-ink-2" role="status" aria-live="polite">
          {fase.id === "preparando" && "Preparando el formulario seguro de Stripe…"}
          {fase.id === "cobrando" && "Cobrando el anticipo…"}
          {fase.id === "autenticando" && "Tu banco pide confirmar el cargo. Sigue los pasos en la ventana de Stripe."}
          {fase.id === "esperando" && "Esperando la confirmación de Stripe. No vuelvas a pagar."}
        </p>
      )}

      {fase.id === "pagado" && (
        <p className="note" role="status">
          <b>Anticipo cobrado.</b> El precio quedó congelado y la unidad, apartada.
          {fase.referencia && <span className="block font-mono text-[11px] text-muted">{fase.referencia}</span>}
        </p>
      )}

      {fase.id === "sin-confirmar" && (
        <p className="note" role="status">
          Stripe todavía no confirma el cargo. Se aplicará en cuanto llegue la confirmación: no vuelvas a pagar.
          Revisa el estado de cuenta en unos minutos.
        </p>
      )}

      {bloqueado && fase.id === "inicio" && (
        <p className="text-xs text-warm">El contrato firmado es requisito para cobrar el anticipo.</p>
      )}
      {error && (
        <p className="max-w-[40ch] text-xs text-warm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Autentica con el banco un cargo que vive en la cuenta de Moretti. Devuelve el problema, si hubo. */
async function autenticar(accion: AccionComprador): Promise<string | null> {
  const stripe = await loadStripe(PUBLIC_KEY, { stripeAccount: accion.cuentaConectada });
  if (!stripe) return "No se pudo cargar Stripe para autenticar el cargo.";
  const r = await stripe.handleNextAction({ clientSecret: accion.clientSecret });
  return r.error ? (r.error.message ?? "El banco no autorizó el cargo.") : null;
}

function FormularioTarjeta({
  onGuardada,
  onError,
  onCancelar,
}: {
  onGuardada: (setupIntentId: string) => Promise<void>;
  onError: (mensaje: string) => void;
  onCancelar: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements || enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    try {
      const r = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
        confirmParams: { return_url: window.location.href },
      });
      if (r.error) {
        onError(r.error.message ?? "Stripe no pudo guardar la tarjeta.");
        return;
      }
      if (r.setupIntent.status !== "succeeded") {
        onError("La tarjeta no quedó guardada. Revisa los datos o usa otra.");
        return;
      }
      await onGuardada(r.setupIntent.id);
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="w-full space-y-4">
      <div className="rounded-[var(--r-input)] border border-line-2 bg-surface p-4">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>
      <p className="text-[11px] text-muted">
        Prueba: 4242 4242 4242 4242 · con autenticación 4000 0025 0000 3155 · fondos insuficientes 4000 0000 0000 9995
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-sm" disabled={!stripe || enviando}>
          {enviando ? "Guardando…" : "Guardar tarjeta y pagar anticipo"}
        </button>
        <button type="button" className="text-xs text-muted hover:text-ink" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
