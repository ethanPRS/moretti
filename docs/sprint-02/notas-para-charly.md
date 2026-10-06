# Notas para Charly · Sprint 2

Lo que cambió el lunes 5 en código tuyo o que te toca, para la revisión
cruzada (W + X). Todo está en la rama `ethan/sprint-2`.

## 1. Cambié tres cosas de `confirmarCobroStripe` (webhook)

- **El estado financiero ya pasa por la máquina** (`moverEstadoPorPago`), igual
  que el camino de la pasarela. Antes escribía `estadoFinanciero` directo:
  se saltaba «APARTADO requiere contrato Y anticipo» y no dejaba un evento
  por paso. (D-24)
- **Ya no reabre un plan cancelado** si el pago llega tarde (el mismo error que
  se corrigió en `aplicarPago` en el Sprint 1).
- **Crea el comprobante fiscal pendiente** dentro de la misma transacción (D-31).

Prueba que lo cubre: `lib/motor/obra.int.test.ts` y
`lib/motor/comprobantes.int.test.ts` (crean el `IntentoCobro` a mano y llaman
`confirmarCobroStripe`).

## 2. `prepararIntentoCobro` rechaza exhibiciones que ya no están vigentes

Con el versionado, una exhibición puede quedar REEMPLAZADA o CANCELADA. Ya no
se cobra; el error dice por qué. Para tu cobro programado (O) y el barrido de
vencidas: **filtra por `estado in (PENDIENTE, VENCIDA)`**, nunca por número.
Puede haber dos exhibiciones con el mismo número (una mensualidad y un
adelanto, o la vieja reemplazada y la nueva); el único es
`(planId, version, tipo, numero)`.

## 3. Tipos de exhibición nuevos

`Exhibicion.tipo`: ANTICIPO, MENSUALIDAD, ADELANTO, LIQUIDACION. El adelanto
y la liquidación se cobran desde el back office (comprador no presente →
fuera de sesión, con la tarjeta guardada). Hoy pasan por `cobrarExhibicion` y
la pasarela del motor; cuando conectes el cobro fuera de sesión real, son un
cobro más. La descripción en Stripe puede usar `conceptoExhibicion(numero, tipo)`
de `lib/motor/recalculo.ts`.

## 4. Si el banco rechaza un adelanto

El motor crea otra versión que restituye el calendario (D-28). Si después
llega un `payment_intent.succeeded` de ese cargo, `aplicarPago` lo registra
como `Pago` AJUSTADO sin tocar el saldo y deja la alerta
`pago_a_exhibicion_retirada`. Para tu conciliación (sprint 3): esos son los
que hay que revisar a mano.

## 5. Lo que encontré y no toqué

- `prepararIntentoCobro` usa la llave `exhibicion_${id}` sin número de
  intento: después de un rechazo, el segundo intento reutiliza la llave y
  Stripe devolvería el mismo PaymentIntent fallido. El contrato v2 pide
  `plan_…:exh_…:int_N` (S1-09).
- `confirmarCobroStripe` no compara el monto del PaymentIntent con el del
  intento.
- En ClickUp, **O (cobro programado)** está *complete* desde el 4 de oct, pero
  no hay commits tuyos en GitHub después del 2. Si está en tu máquina, súbelo
  en una rama desde `main` para revisarlo.

## 6. Cambio de forma del cargo: cargo de destino (D-33), urgente para L, K y O

Ana Cris confirmó que **cobra la plataforma y le transfiere a Moretti**. Hoy
el código hace **cargo directo** (el PaymentIntent vive en la cuenta de
Moretti). Lo que cambia:

| Dónde | Hoy | Con cargo de destino |
|---|---|---|
| `app/api/stripe/create-payment-intent/route.ts` | `paymentIntents.create(…, { stripeAccount })` | Sin `stripeAccount` en las opciones. En los parámetros: `transfer_data: { destination: intento.stripeAccountId }` y el mismo `application_fee_amount`. **Sin `on_behalf_of`.** Se conserva `idempotencyKey`. |
| `retrieve` del intent existente | con `{ stripeAccount }` | sin `stripeAccount` |
| `components/pagos/CobrarConStripe.tsx` | `loadStripe(PUBLIC_KEY, { stripeAccount })` | `loadStripe(PUBLIC_KEY)`: el Payment Element habla con la plataforma. |
| `app/api/stripe/webhook/route.ts` | Exige `event.account` (eventos de Connect) | Los eventos del cobro llegan a la plataforma, sin `event.account`. Endpoint de la cuenta (no «Connect») en el panel y en `stripe listen`. La cuenta destino sale del PaymentIntent (`transfer_data.destination`) o del `IntentoCobro`. |
| `confirmarCobroStripe` / `marcarIntentoCobroFallido` | Comparan `stripeAccountId` del evento con el del intento | Comparar contra el `transfer_data.destination` del PaymentIntent. |
| Guardar la tarjeta (K) | — | SetupIntent `usage: "off_session"` en la plataforma; **ya no hay que clonar** el método de pago. |
| Cobro fuera de sesión (O) | — | `paymentIntents.create({ customer, payment_method, off_session: true, confirm: true, transfer_data, application_fee_amount })` en la plataforma. |

Para probarlo en el panel de Stripe (modo prueba): el cargo aparece en la
plataforma, con una **transferencia** a la cuenta de Moretti y la
**comisión de la aplicación** separada. Esa es la comprobación 2 del
objetivo del Sprint 1.

## 7. Actualización: la plataforma RETIENE el dinero (D-34) — sustituye al §6

Ana Cris respondió I-10: **la plataforma guarda el dinero hasta que ella
decide pagarle a Moretti.** El cargo de destino del §6 transfiere en el acto,
así que ya no aplica. Queda **cargos y transferencias separados**:

| Dónde | Qué va |
|---|---|
| `create-payment-intent` y `pasarelaStripe.cobrar` | PaymentIntent **en la plataforma**, sin `stripeAccount`, **sin `transfer_data` y sin `application_fee_amount`**. Todo queda en el saldo de la plataforma. `transfer_group: "proyecto_<id>"` para ligarlo después. |
| `CobrarConStripe.tsx` | `loadStripe(PUBLIC_KEY)` sin `stripeAccount`. |
| Webhook | Eventos de la cuenta de la plataforma (sin `event.account`). Agregar `transfer.created`, `transfer.reversed`. |
| `pasarelaStripe.transferir` (nuevo en el contrato) | `stripe.transfers.create({ amount: montoCentavos, currency: "mxn", destination: <acct del proyecto>, transfer_group }, { idempotencyKey: "transferencia_" + transferenciaId })`. El monto ya viene **neto** (cobrado − comisión). |

Lo de Ethan ya está en `ethan/sprint-3`: el registro de lo retenido
(`Pago.transferenciaId`), el modelo `TransferenciaMoretti`, el motor
(`lib/motor/transferencias.ts`: reserva los pagos, llama a `transferir`, si
falla los libera, si no contesta reintenta con la misma llave) y la pantalla
«Pagos a Moretti» donde Ana Cris autoriza. Con la pasarela falsa funciona de
punta a punta; falta tu `transferir` real.
