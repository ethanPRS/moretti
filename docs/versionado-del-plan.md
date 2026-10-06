# Versionado del plan: adelanto y liquidación anticipada

Actividad **R** del Sprint 2. Regla R4: **recalcular versiona, no
sobrescribe**. Código: `lib/motor/recalculo.ts` (el cálculo, puro) y
`lib/motor/versiones.ts` (aplicarlo y cobrarlo). Decisiones D-25 a D-29.

## Qué es una versión

- `Plan.version` es la versión vigente; nace en 1.
- Cada `Exhibicion` guarda la `version` en que nació y su `tipo`: ANTICIPO,
  MENSUALIDAD, ADELANTO o LIQUIDACION.
- Lo **vigente** es lo PENDIENTE, VENCIDA o PAGADA. Lo REEMPLAZADA o
  CANCELADA es historia: no se cobra ni se suma, pero no se borra.
- `VersionPlan` guarda la **foto** de cada calendario (concepto, fecha,
  monto, estado) con su motivo, quién la hizo y cuándo. La versión 1 se
  fotografía la primera vez que el plan se recalcula.
- Invariante R7, verificado en cada versión antes de guardarla: lo vigente
  suma exactamente el precio congelado.

## Adelanto

Reduce el **número** de exhibiciones, no el monto.

1. Paga completas las siguientes mientras alcance.
2. El sobrante (menor a una exhibición) se abona a la última. Si la última
   es más chica que el sobrante, se cubre y el resto pasa a la penúltima.
3. Un adelanto igual o mayor al saldo no procede: es una liquidación.

Ejemplo, DEPA 2R con Casa Lista ($147,300; anticipo cobrado; quedan 11 × $8,593
y una de $8,587). Adelanto de **$20,000**:

| | Versión 1 | Versión 2 |
|---|---|---|
| Mensualidades 1 y 2 | $8,593 c/u, por cobrar | REEMPLAZADAS |
| Adelanto (toma el número 1) | — | $20,000, cobrado hoy |
| Mensualidades 3 a 11 | $8,593 c/u | iguales (no cambian de versión) |
| Mensualidad 12 | $8,587 | REEMPLAZADA → nueva de **$5,773** (recibe $2,814) |
| Exhibiciones por cobrar | 12 | 10 |
| Total vigente | $147,300 | $147,300 |

## Liquidación anticipada

El saldo completo en un cargo, **sin descuento**. Todas las pendientes pasan
a CANCELADA; el plan y la unidad quedan LIQUIDADO al confirmarse el cobro.
Sólo en el back office; no se promociona ni aparece en el sitio.

## Cuando el banco dice que no

El recálculo se aplica primero y luego se cobra por el camino normal
(llave de idempotencia, comisión, bitácora, comprobante fiscal).

| Resultado del cobro | Qué pasa con el plan |
|---|---|
| Exitoso | Queda la versión nueva. |
| Pendiente (3-D Secure) | Queda la versión nueva; el webhook aplica el pago. No se puede hacer otro recálculo mientras tanto. |
| Rechazado | Otra versión restituye el calendario anterior (mismos montos y fechas). El cobro rechazado queda CANCELADO. |
| Sin respuesta de la pasarela | No se revierte (no se sabe si cobró). Se reintenta con la misma llave. |

## Dónde se ve

Back office › estado de cuenta del plan:

- «Adelanto o liquidación anticipada» muestra la vista previa (cuánto se
  cobra, saldo antes y después, qué exhibiciones se pagan y cuál recibe el
  sobrante) antes de confirmar.
- «Versiones del plan» lista cada versión con su motivo y su calendario.
