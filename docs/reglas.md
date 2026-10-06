# Catálogo de reglas

Actualizado el 27 de septiembre de 2026, al cierre del trabajo de Ethan del
Sprint 1. Cada regla con dónde vive en el código y qué prueba la sostiene.
Una regla sin prueba no está hecha (definición de terminado).

## Las ocho reglas de la especificación (§2)

| # | Regla | Estado | Dónde | Prueba |
|---|---|---|---|---|
| R1 | Sin contrato firmado no se cobra. | ✅ Desde el Sprint 0; ahora el motor ni siquiera llama a la pasarela. | `cobrarAnticipo` | `cobros.int.test.ts` › «R1: sin contrato…» |
| R2 | El precio se congela con el anticipo, no con la cotización. **Se congela la lista completa, no sólo el total.** | ✅ S1-02 | `aplicarPago` (fija `fechaCongelamiento`); los renglones son copia, no referencia al catálogo. | `plan-partidas.int.test.ts` › «R2: cobrar el anticipo congela la lista completa» |
| R3 | Un cobro ejecutado no se edita ni se borra. | ✅ Sin cambios: no hay operación que edite un `Pago`. Si llega otro cargo para una exhibición pagada, no se toca el pago: se alerta. | `compararReferencia` | `cobros.int.test.ts` › «…se alerta sin tocar el pago» |
| R4 | Recalcular versiona, no sobrescribe. | ⏳ Sprints 2–3 (adelantos, upgrades). | — | — |
| R5 | No se produce con el plan vencido. | ⏳ Máquina operativa. | — | — |
| R6 | Después del levantamiento ya no hay cambios. | ✅ Para acabados y fotos (S1-05). Upgrade y cancelación llegan con esas historias. | `lib/motor/acabados.ts` › `asegurarEditable` | `acabados.int.test.ts` › «R6…» |
| R7 | La suma cuadra al peso. | ✅ Plan (Sprint 0) **y ahora también la lista de partidas**. Se verifica al crear el plan y otra vez antes de cobrar el anticipo. | `asegurarR7`, `cobrarAnticipo`, migración | `canasta.test.ts`, `plan-partidas.int.test.ts`, `migraciones.int.test.ts` |
| R8 | Todo cobro nace sin comprobante. | ⏳ Pendientes fiscales, Sprint 3. | — | — |

## Reglas de armado (spec §4, S1-03)

Viven en **una sola función pura**, `cotizar` (`lib/motor/canasta.ts`), que
usan el cotizador del sitio, el alta y el motor. Por eso los tres dan el
mismo total para la misma canasta (S1-04).

### 1. Agregar a un paquete cerrado → se suma a lista

`total = precio del paquete + Σ lista(agregadas)`. El paquete conserva su
precio de conjunto. Lo agregado va en su propio renglón con origen
`AGREGADA`. Un clima de más sobre los que trae el paquete también es
«agregar» (D-06).

### 2. Quitar de un paquete cerrado → deja de ser paquete

`total = Σ lista(lo que queda)`. Bajar la cantidad de una partida del paquete
(2 climas cuando el depa trae 3) también es quitar (D-06). La modalidad pasa a
`A_LISTA`, el plan no guarda `precioId` y se avisa la diferencia:

> Al quitar Clima minisplit, Confort deja de ser paquete: lo que queda se
> cobra a precio de lista. Pagas $200 más que el precio del paquete sin esa
> partida.

La diferencia es siempre `Σ lista(contenido del paquete) − precio del paquete`:
el descuento de conjunto que se pierde (D-07). Con los precios de la maqueta
del 24 de septiembre y la cocina derivada (D-04):

| Prototipo | Casa Lista | Confort | Plus | Total |
|---|---:|---:|---:|---:|
| DEPA 2R (tipo 717) | $0 | $200 | $200 | $300 |
| DEPA 2R-T | $0 | $100 | $100 | $300 |
| DEPA 3R-T | $0 | $200 | $200 | $400 |
| DEPA FLEX | $0 | $300 | $300 | $400 |
| DEPA DUPLEX | $0 | $200 | $200 | $400 |
| GARDEN VILLA | $0 | $200 | $200 | $300 |
| GARDEN VILLA FLEX | $0 | $200 | $200 | $400 |
| DEPA A | $0 | $200 | $200 | $300 |
| DEPA B | $0 | $200 | $200 | $400 |
| DEPA C | $0 | $200 | $200 | $400 |
| DEPA D | $0 | $100 | $0 | $200 |
| DEPA E | $0 | $0 | $0 | $200 |
| DEPA F | $0 | $100 | $100 | $200 |

Casa Lista siempre da $0 porque de ahí se derivó el precio de la cocina. Que
los descuentos sean de $0 a $400 dice que en la maqueta el «precio de
paquete» es más bien redondeo que descuento. **Vale preguntarle a Ana Cris si
es a propósito** (está en `docs/sprint-01/impedimentos.md`).

### 3. Canasta desde cero → «Arma el tuyo»

`total = Σ lista(partida × cantidad)`, todo `AGREGADA`, **sin cocina** (D-08),
modalidad `ARMA_EL_TUYO`, el plan apunta al paquete 05 como etiqueta.
Arranca con clósets y carpintería marcados y los climas del prototipo.

### Lo que el motor no deja pasar (con el mensaje que dice por qué)

| Caso | Mensaje |
|---|---|
| Cocina en «Arma el tuyo» | «Cocina integral sobre diseño» no se vende en «Arma el tuyo». Si la quiere, elija un paquete cerrado. |
| Dos de algo que no es clima | «Clósets de recámaras» va una sola vez por departamento: sólo los climas llevan cantidad. |
| Más de 9 climas | Se pueden pedir hasta 9 equipos de «Clima minisplit». |
| Cantidad negativa o con decimales | La cantidad de «…» no es válida: tiene que ser un número entero, cero o mayor. |
| Partida sin precio en el prototipo | «…» no tiene precio de lista para este prototipo. Cárgalo en el catálogo antes de cotizar. |
| Canasta vacía | La canasta está vacía: marca al menos una partida. |

## Mínimo para financiar (S1-03)

- Se lee de `Proyecto.minimoPlan` (por defecto $50,000). **Ya no hay
  constante en el código** (`MINIMO_PLAN` se borró).
- Debajo del mínimo **no se genera plan** (D-09) y el alta se rechaza con:
  > El total ($25,500) no llega al mínimo para financiar de este proyecto
  > ($50,000), así que no se genera plan a 12 meses: se paga de contado en un
  > solo pago. Le faltan $24,500 para poder pagarlo en mensualidades.
- El alta crea comprador y plan en la misma transacción: si la canasta no
  pasa, no queda un comprador suelto.
- En el sitio, el cotizador esconde anticipo y mensualidad y dice cuánto falta.

## Levantamiento (spec §4)

Lo lleva una canasta con al menos una partida `A_LA_MEDIDA` (cocina,
clósets, carpintería, lavado). Una canasta de puro catálogo no lo lleva y
entra directo a pedido. Se muestra en el sitio, en el alta y en la bitácora
del plan.

## Acabados y fotos (S1-05)

- Un acabado por partida, de las opciones del catálogo (`Partida.acabados`).
- Hasta dos fotos por partida, JPG o PNG (por contenido), máximo 5 MB.
- Se cambian mientras la unidad esté en estado operativo `PENDIENTE`; después
  del levantamiento, R6 (D-10). Congelar el precio con el anticipo **no**
  congela el acabado.

## Cobros a través de la pasarela (S1-08)

| La pasarela contesta | El motor |
|---|---|
| `exitoso` | Aplica el pago una sola vez (índice único de `Pago.exhibicionId`), guarda la referencia. |
| `pendiente` | No marca nada ni cuenta intento; evento `cobro_pendiente`. Lo aplica el webhook con `aplicarCobroConfirmado`. |
| `rechazado` | La exhibición sigue pendiente; `intentosRechazados` sube una vez; evento `cobro_rechazado` con el código. |
| (no contesta) | No marca nada; evento `cobro_sin_respuesta`; volver a intentar usa la misma llave. |

## Máquina financiera (S1-13)

`lib/motor/estados.ts` (pura) y `cambiarEstadoFinanciero` en `planes.ts`.

| Desde | Procede | ¿A mano? |
|---|---|---|
| Cotizado | Apartado · Cancelado | Apartado no: lo provoca el anticipo cobrado con contrato (regla cruzada, spec §7). |
| Apartado | Al corriente · Cancelado | Al corriente no: lo provoca la primera mensualidad. |
| Al corriente | Liquidado · Suspendido · Cancelado | Liquidado no: lo provoca la última exhibición. |
| Suspendido | Al corriente · Cancelado | Sí las dos. |
| Liquidado | Cancelado | Sí. |
| Cancelado | — (definitivo) | — |

- Una transición inválida se rechaza y dice cuál sí procede: «No se puede
  pasar de Apartado a Suspendido. Desde Apartado sólo procede: Al corriente,
  Cancelado.»
- Cada transición deja un evento `estado_financiero_cambiado` en la unidad,
  con el anterior, el nuevo y el motivo.
- Cancelar exige motivo y cancela el plan abierto: ya no se le cobra.
- Un pago ya cobrado nunca se rechaza por el estado (D-19).
