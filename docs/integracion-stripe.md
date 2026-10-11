# Integración con Stripe

Cómo cobra el prototipo con Stripe (siempre en **modo prueba**), qué hay que
configurar en el Dashboard y cómo se prueba. El contrato entre el motor y la
pasarela está en [`contrato-pasarela.md`](contrato-pasarela.md); las
decisiones, en [`decisiones.md`](decisiones.md) (D-01, D-13, D-32, D-34, D-36 a D-39).

## El modelo en una línea

> **Actualizado el 11 oct (integración del Sprint 3).** Charly escribió este
> documento para cargos directos en la cuenta de Moretti. Ana Cris decidió
> después que **cobra la plataforma y retiene** (D-34). El código ya está
> integrado así; este documento también.

**Stripe Connect con cargos y transferencias separados (D-34)**: la tarjeta
del comprador y **todos los cobros** viven en la cuenta de la **plataforma**
(día uno), sin `application_fee_amount`. A Moretti se le paga con una
`Transfer` a su cuenta conectada cuando Ana Cris lo autoriza en
«Pagos a Moretti»: lo cobrado menos la comisión del canal.

```
Comprador ──tarjeta──▶ Plataforma (SetupIntent off_session, Customer + PaymentMethod)
                          │
                          ├─ PaymentIntent (transfer_group = proyecto_<id>) ── el dinero se queda aquí
                          │      └─ webhook (sin event.account) ──▶ /api/stripe/webhook ──▶ motor
                          │
                          └─ Ana Cris autoriza ──▶ Transfer (neto) ──▶ Cuenta de Moretti (acct_…)
```

Reglas que el código respeta:

- **R3:** un cobro no se edita ni se borra. Reembolsos, disputas perdidas y
  cargos de más son **registros nuevos** (`Reembolso`, `Disputa`,
  `CargoExcedente`) con su evento.
- **R7:** anticipo + 12 = precio congelado; el redondeo lo absorbe la 12.
- **La comisión** es `Proyecto.porcentajeComision`, nunca una constante. Cada
  `Pago` guarda el % y el monto aplicados.
- **La pasarela manda sobre el dinero:** si lo que Stripe cobró (monto o
  comisión) no coincide con la base, se registra lo de Stripe y queda un
  evento `discrepancia_stripe`.
- **Bitácora append-only** (`Evento`) para cada cambio.

## El flujo completo

| Paso | Quién lo dispara | Código | Qué pasa en Stripe |
|---|---|---|---|
| 1. Guardar la tarjeta | El comprador al apartar, o el back office | `prepararTarjeta` → navegador (Elements) → `registrarTarjeta` | `customers.create` (una vez) y `setupIntents.create` con `usage: off_session`. El comprador autoriza los cargos futuros (casilla obligatoria). |
| 2. Anticipo (30 %) | El comprador presente | `cobrarAnticipo` | Crea el PaymentIntent en la plataforma con `confirm: true` y `capture_method` = `STRIPE_CAPTURE_METHOD`. Si el banco pide 3DS, queda **pendiente** y el navegador recibe `accion.clientSecret`. |
| 2b. Captura manual | El back office | `capturarAnticipo` / `liberarAnticipo` | Sólo con `STRIPE_CAPTURE_METHOD=manual`: el anticipo queda autorizado y se captura (`/api/planes/<id>/anticipo/capturar`) o se libera (`…/liberar`). |
| 3. Mensualidades | El **barrido** (cron) o «Cobrar» en el back office | `cobrarVencidas` → `cobrarExhibicion` | Igual que el anticipo, con `off_session: true` y siempre captura automática. |
| 4. Confirmación | Stripe | `/api/stripe/webhook` | Ver la lista de eventos abajo. |
| 5. Reembolso | El back office, o alguien desde el Dashboard de la plataforma | `reembolsarPago` (`/api/pagos/<id>/reembolsar`) · `charge.refunded` | `refunds.create` en la plataforma; `devolverComision` queda en la metadata. Si el pago ya se transfirió a Moretti, se bloquea: primero hay que revertir la transferencia (U). |

### Llave de idempotencia

`plan_<planId>:exh_<n>:int_<intento>` (`llaveIdempotencia()`); el anticipo es
`exh_0`. El intento es `Exhibicion.intentosRechazados + 1`: sólo sube con un
rechazo (o una autorización liberada).

- Dos envíos del mismo cobro llevan la **misma llave**: Stripe devuelve el
  mismo PaymentIntent y no cobra dos veces.
- Después de un rechazo la llave **cambia**. Por eso el anticipo también lleva
  el intento: con una llave fija (`plan_<id>:anticipo`), Stripe devolvería el
  mismo rechazo durante 24 h aunque el comprador ponga otra tarjeta.
- Transferencias a Moretti: `transferencia_<id>`; si la pasarela no contesta,
  se reintenta la misma transferencia con la misma llave.
- Reembolsos: `pago_<pagoId>:reembolso_<n>` (`llaveReembolso()`).

## El barrido de la cobranza

`lib/motor/barrido.ts` · lo dispara un cron con
`GET /api/cobranza/barrido` y `Authorization: Bearer <CRON_SECRET>`, o
`npm run cobranza:barrido` a mano.

Cobra fuera de sesión cada mensualidad que:

- ya llegó a su fecha y no está pagada (`PENDIENTE` o `VENCIDA`);
- es de un plan `ACTIVO` o `SUSPENDIDO` por vencidas, con el anticipo cobrado;
- **no** tiene una disputa abierta en su plan;
- **no** es de un comprador con la tarjeta marcada inválida;
- no espera otra tarjeta (`requiereTarjetaNueva`), no tiene un cobro pendiente
  (`cobroPendienteDesde`) y ya pasó su espera tras un rechazo (`proximoIntentoEn`).

**No cobra dos veces**: cada exhibición se toma con una actualización
condicionada (`bloqueadaHasta`) que repite las condiciones de arriba; de dos
barridos simultáneos sólo uno la gana. Y si se cruza con un clic en el back
office, la llave es la misma.

Si no puede cobrar (sin tarjeta, pasarela caída), la marca `VENCIDA` con un
evento `exhibicion_vencida` y la reporta en `errores`.

## Rechazos: cada código con su regla

`lib/motor/rechazos.ts` (la tabla) y `lib/motor/reintentos.ts` (la decisión).
Cada código tiene su propia explicación y su propia regla, para saber a qué se
debe cada rechazo. El código queda en la bitácora y en
`Exhibicion.ultimoCodigoRechazo`. El rechazo **no cambia el estado del plan**;
la mensualidad queda `VENCIDA` si ya pasó su fecha.

| Código | Qué significa | Qué hace la cobranza |
|---|---|---|
| `insufficient_funds` | fondos insuficientes | Reintenta a los **3** y a los **7** días; después pide otra tarjeta |
| `generic_decline` | el banco lo rechazó sin dar motivo | Reintenta **una vez a los 2 días** |
| `lost_card` · `stolen_card` · `pickup_card` | perdida · robada · retenida | No reintenta; **la tarjeta queda inválida** para todo el plan |
| `expired_card` | la tarjeta está vencida | No reintenta; pide tarjeta nueva (si el banco la renueva sola, vuelve al barrido) |
| `card_declined` · `do_not_honor` | rechazo sin motivo | Como `generic_decline` (*propuesta*) |
| `processing_error` · `try_again_later` · `issuer_not_available` | error o banco no disponible | Reintenta a 1 y 3 días (*propuesta*) |
| `reenter_transaction` | el banco pidió volver a mandarlo | Reintenta a 1 día (*propuesta*) |
| `card_velocity_exceeded` · `withdrawal_count_limit_exceeded` | límite de la tarjeta por ahora | Reintenta a 3 y 7 días (*propuesta*) |
| `fraudulent` · `restricted_card` | posible fraude · restricción | Tarjeta inválida (*propuesta*) |
| `incorrect_number` · `invalid_expiry_*` · `incorrect_cvc` · `invalid_account` · `card_not_supported` · `currency_not_supported` · `transaction_not_allowed` · `not_permitted` · `new_account_information_available` | datos o tipo de tarjeta | Pide tarjeta nueva (*propuesta*) |
| `authentication_required` | el banco pide que el comprador autorice | Pide registrar la tarjeta de nuevo con el comprador presente |
| cualquier otro | motivo no reconocido | No reintenta; pide revisarlo en Stripe, con el código a la vista |

Los de la especificación van tal cual; los marcados *propuesta* están por
ratificar con Operación. Si el banco manda `advice_code = do_not_try_again` o
`confirm_card_data`, se respeta aunque el código diga reintentar. Cuando el
comprador registra otra tarjeta, sus mensualidades rechazadas vuelven al
barrido, la cuenta de reintentos empieza de cero y se quita la marca de inválida.

## Suspensión del plan

`lib/motor/suspension.ts`. El **plan** pasa a `SUSPENDIDO` si tiene **dos
exhibiciones vencidas** (`COBRANZA_VENCIDAS_SUSPENDEN`) **o una disputa
abierta**, y vuelve a `ACTIVO` cuando ya no queda ningún motivo. Cada cambio
deja `plan_suspendido` o `plan_reactivado` en la bitácora. Un plan suspendido
por vencidas se sigue cobrando (cobrar es lo que lo reactiva); por disputa, no.

## Reembolsos, disputas y comisión

| Qué | Cómo se registra |
|---|---|
| Reembolso desde el back office | `POST /api/pagos/<pagoId>/reembolsar` con `{ devolverComision: true\|false, motivo, montoCentavos? }`. `devolverComision` es **obligatorio** (lo define el contrato). Crea un `Reembolso` (`BACK_OFFICE`). |
| Alguien reembolsa desde el Dashboard de la plataforma | `charge.refunded` → se leen los reembolsos del cargo y se registra cada uno una vez (origen `DASHBOARD_MORETTI`, nombre heredado). |
| Disputa abierta | `charge.dispute.created` → `Disputa` + plan `SUSPENDIDO`; el barrido no le cobra. |
| Disputa cerrada | `charge.dispute.closed` → ganada: se reactiva; perdida: además un `Reembolso` (`DISPUTA_PERDIDA`). |
| Comisión | Ya no hay application fee (D-34): la comisión se guarda en cada `Pago` y es lo que no se transfiere. Un pago con reembolso o disputa no entra en ninguna transferencia hasta que una persona lo revise. |
| Cargo de más | Un segundo cargo confirmado para una exhibición pagada queda en `CargoExcedente` con alerta para reembolsarlo. |

Ninguno edita el `Pago` original ni mueve el saldo: devolver dinero no decide
si se vuelve a cobrar o se cancela; eso lo decide una persona con la alerta.

## Eventos del webhook

Un solo endpoint: `/api/stripe/webhook`. Los tipos que no se manejan
contestan **200** y quedan en el log y en `EventoStripe`.

Todos de la **plataforma** («Events on your account», `STRIPE_WEBHOOK_SECRET`).
Un evento de una cuenta conectada se ignora con una nota.

- `setup_intent.succeeded`
- `payment_method.automatically_updated`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.closed`
- `payment_intent.amount_capturable_updated` *(sólo si `STRIPE_CAPTURE_METHOD=manual`)*
- `payment_intent.canceled` *(sólo si `STRIPE_CAPTURE_METHOD=manual`)*

## Variables de entorno

| Variable | Para qué | Dónde se saca |
|---|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Elements en el navegador | Dashboard › Developers › API keys · `pk_test_…` |
| `STRIPE_SECRET_KEY` | Todo lo del servidor. **Sólo `sk_test_`**. | Igual · `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | Firma de los eventos de la plataforma (o de todos, con `stripe listen`) | `stripe listen` o el endpoint del Dashboard · `whsec_…` |
| `STRIPE_CAPTURE_METHOD` | `automatic` (por defecto) o `manual` para el anticipo. Decisión legal pendiente. | — |
| `CRON_SECRET` | Protege `/api/cobranza/barrido`. Mínimo 16 caracteres. | `openssl rand -hex 32` |
| `COBRANZA_VENCIDAS_SUSPENDEN` | Vencidas que suspenden el plan (por defecto 2) | Contrato |
| `STRIPE_E2E_CUENTA` | La cuenta conectada (destino de la transferencia) que usa `npm run test:stripe` | La `acct_…` de prueba de Moretti |
| `DATABASE_URL` · `ADMIN_PASSWORD_HASH` · `SESSION_SECRET` | Base y back office | `.env.example` |

## Qué configurar en el Dashboard de Stripe

Todo en **modo prueba**.

1. **Llaves.** Developers › API keys: `pk_test_…` y `sk_test_…` al `.env`.
2. **Connect.** Activar Connect y crear la cuenta conectada de prueba de
   Moretti con la capacidad **Transfers** activa, en México (MXN). Copiar su
   `acct_…`. (Con D-34 no necesita cobrar con tarjeta: sólo recibe.)
3. **La cuenta en el proyecto.** Back office › Proyectos › el proyecto ›
   «Cuenta de Stripe de Moretti (Connect)» = `acct_…`. Para `npm run test:stripe`,
   la misma en `STRIPE_E2E_CUENTA`.
4. **Webhooks.**
   - **Local:**
     ```bash
     stripe listen \
       --api-key "$(grep ^STRIPE_SECRET_KEY .env | cut -d= -f2 | tr -d '"\r ')" \
       --events setup_intent.succeeded,payment_method.automatically_updated,payment_intent.succeeded,payment_intent.payment_failed,payment_intent.amount_capturable_updated,payment_intent.canceled,charge.refunded,charge.dispute.created,charge.dispute.closed \
       --forward-to localhost:3000/api/stripe/webhook
     ```
     Copiar el `whsec_…` a `STRIPE_WEBHOOK_SECRET` y reiniciar `npm run dev`.
   - **Desplegado:** un destino «Your account» a
     `https://<dominio>/api/stripe/webhook` con los eventos de la lista de
     arriba; su secreto en `STRIPE_WEBHOOK_SECRET`.
5. **Comisión.** No se configura en el Dashboard: es lo que la plataforma
   no le transfiere a Moretti (D-34). La tarifa de procesamiento de Stripe la
   paga la plataforma: Ana Cris tiene que saberlo al fijar el %.
   En modo prueba, lo cobrado queda «pending» unos días; para probar una
   transferencia enseguida, cobrar con `pm_card_bypassPending`
   (4000 0000 0000 0077).
6. **Qué tarjetas se aceptan.** El código sólo pide `card`. Bloquear
   prepagadas, países o marcas se hace con reglas de **Radar**.
7. **Sin Billing.** No activar suscripciones ni Smart Retries: los reintentos los hace el barrido.
8. **Cron.** Llamar el barrido una vez al día con `CRON_SECRET`.

## Probar cada evento con la Stripe CLI (local)

Con `npm run dev` y `stripe listen` corriendo. En cada caso, el evento debe
salir `[200]` en la terminal de `stripe listen` y quedar en `EventoStripe`
con `procesado = true` (`npx prisma studio`).

**Los que necesitan un cobro real del motor** (la metadata del PaymentIntent
dice a qué exhibición va; `stripe trigger` crea objetos sueltos que el motor
ignora a propósito, con 200):

| Evento | Cómo provocarlo |
|---|---|
| `payment_intent.succeeded` | Cobrar el anticipo desde el back office con la tarjeta 4242. |
| `payment_intent.payment_failed` | Registrar la tarjeta 4000 0000 0000 0341 y cobrar una mensualidad. |
| `charge.refunded` | `stripe refunds create --payment-intent pi_…` (como si alguien reembolsara desde el Dashboard), o `POST /api/pagos/<id>/reembolsar`. |
| `charge.dispute.created` · `charge.dispute.closed` | Cobrar con la tarjeta **4000 0000 0000 0259** (crea la disputa sola). Para cerrarla: en el Dashboard de la plataforma, responder con evidencia `winning_evidence` (gana) o `losing_evidence` (pierde). |
| `payment_intent.amount_capturable_updated` · `payment_intent.canceled` | Con `STRIPE_CAPTURE_METHOD=manual`, cobrar el anticipo y luego `POST /api/planes/<id>/anticipo/liberar`. |
| `payment_method.automatically_updated` | No se puede provocar con una tarjeta de prueba; se cubre en `barrido.int.test.ts` («expired_card…»). |

**Para ver que la firma y el ruteo funcionan** (el motor los ignora con 200 y una nota):

```bash
stripe trigger payment_intent.succeeded
stripe trigger charge.refunded
stripe trigger charge.dispute.created
stripe trigger setup_intent.succeeded
```

## Tarjetas de prueba

| Tarjeta | `pm_…` | Qué hace |
|---|---|---|
| 4242 4242 4242 4242 | `pm_card_visa` | Cobra siempre |
| 4000 0025 0000 3155 | `pm_card_authenticationRequiredOnSetup` | Pide 3DS al guardarla; luego cobra fuera de sesión |
| 4000 0027 6000 3184 | `pm_card_authenticationRequired` | Pide 3DS en cada cobro (mensualidad: `authentication_required`) |
| 4000 0000 0000 0341 | `pm_card_chargeCustomerFail` | Se guarda, pero todo cargo se rechaza |
| 4000 0000 0000 0259 | `pm_card_createDispute` | Cobra y abre una disputa |
| 4000 0000 0000 9995 | — | Fondos insuficientes |

## Cómo se prueba

| Qué | Dónde |
|---|---|
| Traducción de respuestas de Stripe | `lib/pasarela/stripe-respuestas.test.ts` |
| Reglas por código, consejo del banco, umbral de suspensión | `lib/motor/reintentos.test.ts` |
| Barrido, reintentos por código, tarjeta inválida, suspensión | `lib/motor/barrido.int.test.ts` |
| Reembolsos, disputas, comisión, discrepancias, cargo excedente | `lib/motor/movimientos.int.test.ts` |
| De extremo a extremo contra Stripe | `npm run test:stripe` |

## Fuera de alcance

- **SPEI.** Sólo `card`. SPEI va con `customer_balance` / transferencia y no
  admite cargos fuera de sesión: necesita su propio flujo de conciliación.
- **Vista de Moretti.** No existe: el back office es sólo de día uno. Si
  Moretti tiene acceso, hace falta un rol que no vea la comisión del canal
  (ni en pantallas ni en JSON). Hoy ninguna API pública la devuelve.
- **Pantallas** para reembolsar, capturar y liberar: existen las rutas, no los botones.
- **Avisarle al comprador** (correo) que su tarjeta fue rechazada.
