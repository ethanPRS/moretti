# Registro de parámetros

Historia **S1-12**. La definición de terminado dice: «nada escrito a mano que
la hoja 15 marque como parámetro». Esta tabla dice dónde vive cada uno, quién
lo decide y cómo se cambia. Actualizado el 27 de septiembre de 2026.

## Parámetros que ya viven fuera del código

| Parámetro | Valor hoy | Dónde vive | Quién lo decide | Cómo se cambia |
|---|---|---|---|---|
| % de anticipo | 30 % | `Proyecto.porcentajeAnticipo` | Comercial, por proyecto | Base de datos (por proyecto). |
| % de comisión del canal | 15 % | `Proyecto.porcentajeComision`; **cada `Pago` guarda el % que se le aplicó** | Contrato con cada desarrollador | Base de datos. Un cambio no altera pagos ya hechos. |
| Mínimo para financiar a 12 meses | $50,000 | `Proyecto.minimoPlan` (S1-03) | Comercial, por proyecto | Base de datos. El sitio y el alta lo leen en cada carga. |
| Climas por prototipo | 1 a 4 | `Prototipo.climasDefault` | Moretti / catálogo | Base de datos. |
| Precio de lista por partida y prototipo | Maqueta 5b del 24 sep | `PrecioPartida` | Moretti (por confirmar, Ana Cris) | Base de datos. |
| Precio de lista de la **cocina** | Derivado de Casa Lista (D-04) | `PrecioPartida` | **Provisional**: Moretti | Base de datos, cuando Moretti dé el real. |
| Precio de paquete por prototipo | Maqueta 5b | `Precio` (versionado) | Moretti | Back office › proyecto › «nuevo precio»: cierra la vigencia del anterior. |
| Opciones de acabado por partida | Maqueta 5b, de ejemplo | `Partida.acabados` | Moretti | Base de datos. Los colores son de ejemplo. |
| Dónde se guardan las fotos | `almacen/` en disco | `ALMACEN_LOCAL_DIR` (variable de entorno) + `lib/almacenamiento/index.ts` | Ethan, antes de producción (D-12) | Otra implementación de `Almacenamiento`. |

## Parámetros de Charly (pasarela) — por definir en su código

| Parámetro | Propuesta | Historia |
|---|---|---|
| `capture_method` (automático o retener sin cobrar) | Variable de entorno `STRIPE_CAPTURE_METHOD=automatic\|manual`; por defecto `automatic` mientras el abogado y Moretti deciden (spec §3). | S1-07 |
| Cuenta conectada de Moretti (`acct_…`) | Columna por proyecto (`Proyecto.stripeConnectedAccountId` en la rama de Charly). | S1-07 |
| Llaves de Stripe | `STRIPE_SECRET_KEY` (sólo `sk_test_`), `STRIPE_WEBHOOK_SECRET` en `.env`, nunca en el repo. | S1-06, S1-10 |

## Límites técnicos (constantes a propósito, no de negocio)

| Constante | Valor | Dónde | Por qué es constante |
|---|---|---|---|
| Plazo del plan | 12 mensualidades | `lib/motor/calculo.ts`, `enteros.ts` | Es la definición del producto (spec §4). Si cambia, cambia el producto. |
| Fotos por partida | 2 | `lib/motor/fotos.ts` + CHECK en la base | Spec §4. |
| Tamaño máximo de foto | 5 MB (5,242,880 bytes) | `lib/motor/fotos.ts` + CHECK en la base | Criterio de S1-05. |
| Climas por partida | hasta 9 | `MAX_POR_EQUIPO`, `lib/motor/canasta.ts` | Tope del contador en el sitio y el alta; el motor usa el mismo. |

## Parámetros abiertos (bloquean el Sprint 2 y 3, no este)

De la hoja 15, pestaña «Parámetros», en naranja. **No hay código que los use
todavía**; cuando lo haya, no pueden ser constantes.

| Parámetro | Quién decide | Bloquea |
|---|---|---|
| ¿Se devuelve la comisión del canal al reembolsar? (`refund_application_fee`) | Contrato / abogado | U (Sprint 3) |
| Reintentos por código de rechazo | Especificación / Operación | **En código**: tabla por código en `lib/motor/rechazos.ts`. Los de la especificación (insufficient_funds 3 y 7 días, generic_decline 2 días, perdida/robada/retenida inválida, vencida pide otra) van tal cual; el resto es propuesta por ratificar con Operación. Detalle en `integracion-stripe.md`. |
| ¿Anticipo capturado de inmediato o retenido? (`capture_method`) | Abogado + Moretti | **Ya es parámetro**: `STRIPE_CAPTURE_METHOD` (`automatic` por defecto). Falta la decisión. |
| Penalización por cancelación tardía (hoy 15 % de propuesta) | Contrato | Cancelaciones |
| Exhibiciones vencidas que suspenden (hoy dos) | Contrato | **Ya es parámetro**: `COBRANZA_VENCIDAS_SUSPENDEN` (2); suspende el **plan** (`lib/motor/suspension.ts`). |
| ¿Se devuelve la comisión al reembolsar desde el back office? | Contrato | **Ya es parámetro explícito** de cada reembolso (`devolverComision`, obligatorio). |
| Tolerancia de medida (hoy ±5 %) | Moretti | Mediciones |

## Encontrado al revisar: un parámetro que sigue en el código

`DESCUENTO_CONTADO = 0.08` en `lib/motor/calculo.ts`: el sitio ofrece «si lo
liquidas de contado ahorras 8 %». No es de este sprint y no se tocó, pero:

1. es un parámetro comercial escrito a mano (rompe la definición de terminado), y
2. la spec §4 dice que la liquidación es «sin descuento» (aunque habla de
   liquidar un plan ya en curso, no de pagar de contado desde el inicio).

Quedó en el backlog para aclararlo con Ana Cris y moverlo a `Proyecto`.
