import { describe, it, expect } from "vitest";
import { describirTarjeta, interpretarErrorStripe, interpretarPaymentIntent } from "./stripe-respuestas";

const CUENTA = "acct_moretti";

describe("S1-07 · lo que contesta Stripe, en el contrato del motor", () => {
  it("succeeded es exitoso, con el PaymentIntent como referencia", () => {
    expect(interpretarPaymentIntent({ id: "pi_1", status: "succeeded" }, CUENTA)).toEqual({
      estado: "exitoso",
      referenciaPasarela: "pi_1",
    });
  });

  it("requires_action es pendiente, no rechazo: con lo que el navegador necesita para autenticar", () => {
    expect(
      interpretarPaymentIntent({ id: "pi_2", status: "requires_action", client_secret: "pi_2_secret" }, CUENTA)
    ).toEqual({
      estado: "pendiente",
      referenciaPasarela: "pi_2",
      motivo: "el banco pidió que el comprador se autentique",
      accion: { clientSecret: "pi_2_secret", cuentaConectada: CUENTA },
    });
  });

  it("processing es pendiente y no trae acción: no hay nada que hacer en el navegador", () => {
    const r = interpretarPaymentIntent({ id: "pi_3", status: "processing" }, CUENTA);
    expect(r.estado).toBe("pendiente");
    expect(r).not.toHaveProperty("accion");
  });

  it("requires_payment_method es rechazo, con el decline_code del banco", () => {
    expect(
      interpretarPaymentIntent(
        {
          id: "pi_4",
          status: "requires_payment_method",
          last_payment_error: { code: "card_declined", decline_code: "insufficient_funds", message: "Fondos" },
        },
        CUENTA
      )
    ).toEqual({
      estado: "rechazado",
      codigoRechazo: "insufficient_funds",
      mensaje: "Fondos",
      reintentar: true,
      referenciaPasarela: "pi_4",
    });
  });

  it("requires_capture (captura manual) es pendiente: el dinero está apartado, no cobrado", () => {
    expect(interpretarPaymentIntent({ id: "pi_5", status: "requires_capture" }, CUENTA)).toMatchObject({
      estado: "pendiente",
      referenciaPasarela: "pi_5",
      motivo: expect.stringMatching(/autorizado/),
    });
  });

  it("un estado que el contrato no contempla truena, no se disfraza de exitoso", () => {
    expect(() => interpretarPaymentIntent({ id: "pi_7", status: "canceled" }, CUENTA)).toThrow(/canceled/);
  });
});

describe("S1-09 · los rechazos llegan como excepción", () => {
  it("StripeCardError es rechazo con el decline_code; advice_code manda sobre la tabla", () => {
    const err = {
      type: "StripeCardError",
      code: "card_declined",
      decline_code: "insufficient_funds",
      advice_code: "do_not_try_again",
      message: "Your card has insufficient funds.",
      payment_intent: { id: "pi_6" },
    };
    expect(interpretarErrorStripe(err)).toEqual({
      estado: "rechazado",
      codigoRechazo: "insufficient_funds",
      mensaje: "Your card has insufficient funds.",
      reintentar: false,
      consejo: "do_not_try_again",
      referenciaPasarela: "pi_6",
    });
  });

  it("una mensualidad que pide autenticación fuera de sesión es rechazo authentication_required", () => {
    const r = interpretarErrorStripe({
      type: "StripeCardError",
      code: "authentication_required",
      decline_code: "authentication_required",
      message: "Requires authentication",
    });
    expect(r).toMatchObject({ estado: "rechazado", codigoRechazo: "authentication_required", reintentar: false });
  });

  it("la red o una petición inválida no son rechazos: se dejan subir", () => {
    expect(interpretarErrorStripe({ type: "StripeConnectionError", message: "ECONNRESET" })).toBeNull();
    expect(interpretarErrorStripe({ type: "StripeIdempotencyError", message: "Keys reused" })).toBeNull();
    expect(interpretarErrorStripe(new Error("otra cosa"))).toBeNull();
  });
});

describe("la tarjeta en la bitácora", () => {
  it("marca y últimos cuatro, nunca el número", () => {
    expect(describirTarjeta({ brand: "visa", last4: "4242" })).toBe("visa terminación 4242");
    expect(describirTarjeta(null)).toBe("tarjeta");
  });
});
