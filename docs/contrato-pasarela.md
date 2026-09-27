# Contrato motor ↔ pasarela · versión 2

Historia **S1-01** · Actividad H · archivo `lib/pasarela/contrato.ts`

| | |
|---|---|
| Estado | **Propuesta de Ethan, falta que Charly la ratifique** (lunes 28, 9:15) |
| Versión anterior | v1, 25 de septiembre (commit `3d5cf8e`) |
| Quién la usa | El motor (`lib/motor/planes.ts`) llama; la pasarela (`lib/pasarela/stripe.ts`, Charly) implementa |

El motor nunca llama a Stripe. Llama a la interfaz `Pasarela`. Qué pasarela se
usa se decide en un solo lugar: `lib/pasarela/index.ts`. Mientras la de Stripe
no está, el motor corre contra la falsa (`lib/pasarela/falsa.ts`).

## La interfaz

```ts
interface Pasarela {
  cobrar(solicitud: SolicitudCobro): Promise<ResultadoCobro>;
  prepararTarjeta(solicitud: SolicitudTarjeta): Promise<PreparacionTarjeta>;
}

interface SolicitudCobro {
  planId: string;
  exhibicionId: string;
  numeroExhibicion: number;   // 0 = anticipo, 1..12 = mensualidades
  intento: number;            // 1, 2, 3… sube sólo después de un rechazo
  montoCentavos: number;      // entero: $8,593.00 → 859300
  comisionCentavos: number;   // entero, la calcula el motor
  compradorId: string;
  proyectoId: string;         // para encontrar la cuenta conectada de Moretti
  compradorPresente: boolean; // true = anticipo; false = mensualidad off_session
}

type ResultadoCobro =
  | { estado: "exitoso"; referenciaPasarela: string }
  | { estado: "pendiente"; referenciaPasarela: string; motivo: string }
  | { estado: "rechazado"; codigoRechazo: string; mensaje: string;
      reintentar: boolean; referenciaPasarela?: string };

function llaveIdempotencia({ planId, numeroExhibicion, intento }): string
// → "plan_<planId>:exh_<n>:int_<intento>"
```

## Qué cambió respecto a la v1 y por qué

| # | Cambio | Por qué |
|---|---|---|
| 1 | `ResultadoCobro` pasa de dos casos (`exitoso: true/false`) a **tres** (`exitoso`, `pendiente`, `rechazado`). | Con la tarjeta 4000 0025 0000 3155 el banco pide autenticación: el cargo no está hecho ni rechazado. Si eso se reporta como rechazo, el motor sube el número de intento, el siguiente cobro va con **otra llave** y, si el comprador sí se autentica, **hay dos cargos**. Con `pendiente` el motor no marca nada como pagado, no cuenta intento, y el pago lo aplica el webhook (S1-10). Es el criterio de S1-07 «el cobro pide autenticación y el motor no marca nada como pagado». |
| 2 | `monto` y `montoComision` (pesos con decimales) pasan a **`montoCentavos` y `comisionCentavos`, enteros**. | Stripe cobra en centavos. Convertir en la pasarela con `monto * 100` en JavaScript puede fallar por punto flotante (`1288.95 * 100 = 128894.99999999999`). El motor convierte una vez, con `Decimal`, y los dos lados trabajan con enteros. La pasarela falsa rechaza cualquier cosa que no sea entero. |
| 3 | Se agrega `proyectoId`. | El cargo directo va a la cuenta conectada de Moretti **del proyecto** (spec §9: el porcentaje y la cuenta viven en el proyecto). Con esto la pasarela la encuentra sin que el motor sepa de identificadores de Stripe. |
| 4 | Se agrega `prepararTarjeta`. | Decisión D-01: guardar la tarjeta también pasa por la interfaz. |
| 5 | Se agrega `llaveIdempotencia()` en el contrato. | La llave se arma en un solo lugar y la usan las dos pasarelas. Así la falsa se porta como Stripe en las pruebas del motor y nadie la arma distinto. |
| 6 | La pasarela falsa ahora es **idempotente** y configurable (`crearPasarelaFalsa({ decidir })`). | Misma llave → misma respuesta (incluido un rechazo) y ningún cargo nuevo; misma llave con otro monto → error, igual que Stripe. Permite probar en el motor «tres envíos, un cargo» y «un rechazo deja la exhibición pendiente». |

La llave de idempotencia ya llevaba el número de intento desde el cambio del
25 de septiembre (criterio 2 de S1-01): se conserva igual.

## Reglas para las dos mitades

- **Nadie importa `./falsa` o `./stripe` directamente** desde el código de la
  aplicación: siempre `import { pasarela } from "@/lib/pasarela"`. Las pruebas
  y el seed sí crean su propia pasarela falsa y se la pasan al motor
  (parámetro opcional `{ pasarela }` de `cobrarAnticipo` y `cobrarExhibicion`).
- **El motor decide cuándo reintentar**; la pasarela sólo informa el código y
  si la tabla de la spec §4 dice que se reintenta.
- **Un pago se aplica una sola vez**, venga de la respuesta de `cobrar` o del
  webhook. El motor expone `aplicarCobroConfirmado` (S1-08) para que el
  webhook de Charly lo llame; si el pago ya estaba aplicado no hace nada.
- **Un intento pendiente no se reintenta con llave nueva.** Mientras no llegue
  el webhook, volver a cobrar usa la misma llave y Stripe devuelve el mismo
  PaymentIntent.

## Para ratificar el lunes (checklist de S1-01)

- [x] La firma de `cobrar` y sus tipos están en el repositorio (v2, arriba).
- [x] La llave de idempotencia incluye el número de intento.
- [x] Decidido que guardar la tarjeta pasa por la interfaz (D-01).
- [x] Escrito en la bitácora dónde vive la tarjeta mientras llega la decisión (D-02, variante provisional).
- [ ] **Charly** revisa los cambios 1 a 6 y los aprueba o pide ajustes. Lo que
      Charly cambie en su rama `charly/integracion-stripe` para seguir este
      contrato está en `docs/sprint-01/notas-para-charly.md`.
