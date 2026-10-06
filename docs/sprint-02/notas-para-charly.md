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
