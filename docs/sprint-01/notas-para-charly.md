# Notas para Charly · Sprint 1

De Ethan (preparado por Claude el domingo 27) para el lunes 28. Son tres
cosas: qué cambió en el contrato, qué va a chocar al juntar las ramas y una
revisión de `charly/integracion-stripe` (commit `ce2312d`, 25 sep). Nada de
tu rama se tocó: todo lo de abajo son propuestas para hablarlo en S1-01 y en
la sesión en pareja de S1-08.

## 1. El contrato cambió a v2 — hay que ratificarlo (S1-01)

Detalle completo en `docs/contrato-pasarela.md`. Lo que te afecta al
implementar `lib/pasarela/stripe.ts`:

| Antes (v1) | Ahora (v2) | Por qué |
|---|---|---|
| `{ exitoso: true/false }` | `estado: "exitoso" \| "pendiente" \| "rechazado"` | Con la 3155 el PaymentIntent queda en `requires_action`. Si lo reportas como rechazo, el motor sube el intento y el siguiente cobro va con otra llave: si el comprador sí se autentica, doble cargo. `requires_action` y `processing` → `pendiente`. |
| `monto`, `montoComision` en pesos | `montoCentavos`, `comisionCentavos`, enteros | Ya no multipliques por 100. `amount = montoCentavos`, `application_fee_amount = comisionCentavos`. |
| — | `proyectoId` | Para buscar el `acct_` de Moretti del proyecto. |
| — | `prepararTarjeta({ compradorId, proyectoId }) → { clientSecret }` | Guardar la tarjeta pasa por la interfaz (D-01). |
| la llave la armabas tú | `llaveIdempotencia(solicitud)` exportada del contrato | La misma función para las dos pasarelas. |

El motor ya expone lo que tu webhook tiene que llamar:

```ts
import { aplicarCobroConfirmado, registrarCobroRechazado } from "@/lib/motor/planes";

// payment_intent.succeeded — aplica el pago una sola vez; si ya estaba, no hace nada.
await aplicarCobroConfirmado({ exhibicionId, referenciaPasarela: paymentIntent.id });

// payment_intent.payment_failed — anota el rechazo y sube el intento una sola vez.
await registrarCobroRechazado({ exhibicionId, intento, codigo: last_payment_error.code });
```

Para eso el PaymentIntent tiene que llevar en `metadata` al menos
`planId`, `exhibicionId`, `numeroExhibicion` e `intento`.

## 2. Lo que va a chocar al juntar las ramas

Tu rama sale de `main` del 10 de septiembre. Desde entonces:

1. **Todo el back office se movió a `/admin`** (commit `90548d2`). Tus
   archivos `app/(panel)/pagos/prueba/page.tsx` y
   `app/(panel)/planes/[id]/CobrarButton.tsx` ahora viven en
   `app/admin/(panel)/…`. Git no los va a mover solo.
2. **Tu migración se tiene que renombrar y recortar.** Se llama
   `20260924120000_stripe_cobranza_base`, con fecha anterior a las del 25 y
   27 que ya están en esta rama, y además agrega `Proyecto.minimoPlan`, que
   la migración `20260927170210_renglones_plan` también agrega (mismo nombre
   y tipo, a propósito). Si se aplican las dos, Postgres truena con «column
   minimoPlan already exists». Propuesta, según el calendario de migraciones
   del plan (tú migras el jueves en la tarde):
   - quitar `ADD COLUMN "minimoPlan"` de tu SQL y de tu `schema.prisma`;
   - regenerarla después de rebasar sobre `sprint-1/ethan`, con un nombre
     posterior (`2026100115xxxx_stripe_cobranza`), con `prisma migrate dev
     --create-only` si ya te deja crear la base sombra, o `migrate diff`
     como la hiciste.
3. **`lib/motor/planes.ts` cambió mucho** (S1-02, S1-03, S1-08). Tus
   funciones `prepararIntentoCobro`, `confirmarCobroStripe` y
   `marcarIntentoCobroFallido` se cruzan con `aplicarCobroConfirmado` y
   `registrarCobroRechazado`. Propuesta abajo.
4. **`prisma/seed.ts`** ahora sólo llama a `prisma/sembrar.ts`. Tu rama le
   quitaba los cobros de DU-001 porque deshabilitaste la ruta de cobro;
   ahora el seed cobra con una pasarela falsa propia, así que eso ya no hace
   falta.
5. **`schema.prisma` se reformateó** con `prisma format` (alineación de
   columnas). Es ruido; conviene resolver el conflicto tomando esta versión
   y volviendo a agregar tus campos.

Orden sugerido: rebasar tu rama sobre `sprint-1/ethan`, resolver en ese
orden, `npx prisma migrate reset` + `npm test` (unitarias e integración, ver
`docs/pruebas.md`).

## 3. Revisión de `charly/integracion-stripe`

Lo que está bien y hay que conservar:

- El webhook verifica la firma con el cuerpo crudo (`request.text()`) y
  responde 400 si no cuadra. ✔ criterio de S1-10.
- Usa `event.account` para saber de qué cuenta conectada viene. ✔ (la nota
  de la sección 08 del plan: con cargos directos los eventos son de la
  cuenta de Moretti).
- Deduplica por `stripeEventId` con índice único y guarda el payload. ✔
- Convierte a centavos con `Decimal`, no con `* 100`. ✔
- Exige llave `sk_test_` antes de hacer nada. ✔ Muy buena idea para que
  nadie apunte a producción por error.

Lo que propongo cambiar (para hablarlo, no son órdenes):

| # | Dónde | Qué pasa | Propuesta |
|---|---|---|---|
| 1 | `prepararIntentoCobro` | La llave es `exhibicion_<id>`: no lleva plan ni **intento**. Después de un rechazo, el siguiente cobro reutiliza el mismo intento (lo encuentra por la llave y lo devuelve), así que no se cumple «un segundo intento tras un rechazo usa una llave nueva» (S1-09). Con el comprador presente, volver a confirmar el mismo PaymentIntent con otra tarjeta sí es un patrón válido de Stripe; pero las mensualidades van fuera de sesión y ahí no alcanza. | Usar `llaveIdempotencia()` del contrato, con el intento que manda el motor. |
| 2 | `api/stripe/create-payment-intent` | Llama a Stripe desde la ruta, no desde `lib/pasarela/stripe.ts`. El motor queda fuera y se pierde el «cambiar un import». | Mover la llamada a `pasarelaStripe.cobrar` y dejar que la ruta llame al motor. |
| 3 | `confirmarCobroStripe` | Repite la lógica de aplicar un pago (saldo, estados, bitácora) que ya está en el motor; si una cambia y la otra no, se desfasan. | Que el webhook llame a `aplicarCobroConfirmado`. |
| 4 | `api/exhibiciones/[id]/cobrar` | Queda en 410. Con S1-08 esa ruta cobra a través de la pasarela y contesta 200/202/402. | Conservar la ruta del motor; tu flujo con Payment Element puede vivir para el anticipo con comprador presente (lo vemos en pareja). |
| 5 | webhook | Procesa el evento antes de contestar. El criterio de S1-10 pide contestar 200 de inmediato y hacer lo pesado después. | Guardar el evento, contestar 200 y procesar aparte (aunque sea después de responder en el mismo proceso, para el prototipo). |
| 6 | webhook | Dos entregas simultáneas del mismo evento: la segunda truena en el `create` por el índice único y contesta 500 (Stripe reintenta; no duplica, pero ensucia el log). | Atrapar P2002 y contestar 200 `duplicate`. |
| 7 | `payment_intent.payment_failed` | Guarda el código en `IntentoCobro` pero no deja evento en la bitácora ni sube el intento del motor. Criterio 5 del objetivo: «el rechazo queda en la bitácora». | Llamar a `registrarCobroRechazado`. |
| 8 | `create-payment-intent` | `capture_method` no se manda; S1-07 pide que sea configurable. | Variable de entorno (propuesta: `STRIPE_CAPTURE_METHOD=automatic\|manual`), documentada en `docs/parametros.md`. |

### Estado al 5 de octubre (rama `charly/stripe-pasarela`)

| # | Estado |
|---|---|
| 1 | Hecho: la llave es `llaveIdempotencia()` con el intento del motor (`lib/pasarela/stripe.ts`). |
| 2 | Hecho: `create-payment-intent` se borró; todo cobro pasa por `pasarelaStripe.cobrar` vía el motor. |
| 3 | Hecho: el webhook llama a `aplicarCobroConfirmado`; `confirmarCobroStripe` se borró. |
| 4 | Hecho: `api/exhibiciones/[id]/cobrar` es la ruta del motor (200/202/402) y la usa el back office para las mensualidades. |
| 5 | **No**: el webhook sigue procesando antes de contestar. Procesar es rápido y, si falla, el 500 hace que Stripe reintente; con `after()` un fallo se perdería sin reintento. Para hablarlo. |
| 6 | Hecho: P2002 en `EventoStripe` se trata como reenvío. |
| 7 | Hecho: `payment_failed` llama a `registrarCobroRechazado`. |
| 8 | **No**: `capture_method` sigue automático. Captura manual necesita una pantalla para capturar o liberar; queda para después. |

La tabla `IntentoCobro` no choca con nada de lo de Ethan: guarda el ciclo del
PaymentIntent y le sirve al webhook. `Exhibicion.intentosRechazados` (D-13)
es sólo el contador con el que el motor arma la llave.
