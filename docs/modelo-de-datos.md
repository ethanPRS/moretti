# Modelo de datos

Actualizado el 27 de septiembre de 2026 (Sprint 1: S1-02 y S1-05). La fuente
de verdad es `prisma/schema.prisma`; esto explica el porqué y las reglas que
el esquema no puede decir solo.

## El cambio del Sprint 1 en una línea

**El plan ya no guarda «un paquete»: guarda la lista de partidas que se
vendió, renglón por renglón** (spec §4). El paquete queda como etiqueta.

```
Proyecto ──< Prototipo ──< PrecioPartida >── Partida (catálogo)
   │            │                               │
   │            └──< Unidad ── Comprador ──< Plan ──< RenglonPlan ──< FotoReferencia
   │                                          │  └──< Exhibicion ── Pago
   minimoPlan, % anticipo, % comisión         └── Paquete (etiqueta), Precio (sólo si PAQUETE)
```

## Tablas nuevas o que cambiaron

### `Proyecto` — una columna nueva

| Columna | Tipo | Para qué |
|---|---|---|
| `minimoPlan` | `DECIMAL(12,2)`, default 50000 | Debajo de este total no se genera plan a 12 meses (S1-03). Mismo nombre y tipo que en la rama de Charly (D-16). |

### `Plan` — dos cambios

| Columna | Antes | Ahora |
|---|---|---|
| `precioId` | obligatorio | **opcional**: sólo se llena si el plan se vendió a precio de paquete (modalidad `PAQUETE`). `onDelete: Restrict`: un precio usado no se borra. |
| `modalidad` | — | `PAQUETE` · `A_LISTA` · `ARMA_EL_TUYO` (enum `ModalidadPlan`). Con qué regla de armado se cotizó. |

`paqueteId` sigue siendo obligatorio, pero es etiqueta: en `A_LISTA` es el
paquete del que se partió; en `ARMA_EL_TUYO`, el paquete 05.

### `RenglonPlan` — nueva (S1-02)

Una fila por partida vendida. Es lo que después se firma en el Anexo A y lo
que se entrega partida por partida.

| Columna | Tipo | Qué es |
|---|---|---|
| `planId`, `partidaId` | FK | |
| `cantidad` | `INT` | 1, salvo los climas. |
| `precioLista` | `DECIMAL(12,2)` | Precio de lista **por pieza** cuando se cotizó (copia de `PrecioPartida`: si la lista cambia después, el renglón no). |
| `precioCongelado` | `DECIMAL(12,2)` | Lo que el renglón suma al plan, **cantidad incluida**. En paquete cerrado es su parte del precio de conjunto (D-05); a lista es `precioLista × cantidad`. |
| `origen` | `PAQUETE` · `AGREGADA` | Si venía en el paquete o lo agregó el comprador. En «Arma el tuyo» todos son `AGREGADA`. |
| `acabado` | `TEXT` nulo | La opción elegida, tal cual está en `Partida.acabados` («Opción 2 · Nogal»). S1-05. |

Índice único `(planId, partidaId, origen)`: una partida puede aparecer dos
veces sólo si una parte venía en el paquete y otra se agregó (Confort con 4
climas: 3 `PAQUETE` + 1 `AGREGADA`, cada uno con su precio).

**Invariantes** (las hace cumplir el motor y las verifican las pruebas):

1. `Σ precioCongelado = Plan.montoCongelado`, al peso (R7). El motor lo
   verifica al crear el plan y otra vez antes de cobrar el anticipo; si no
   cuadra, no cobra.
2. Ningún renglón en cero o negativo.
3. Después de cobrar el anticipo (`Plan.fechaCongelamiento` no nulo) ninguna
   operación del motor cambia un renglón de precio (R2). El acabado sí se
   puede cambiar hasta el levantamiento (R6).

### `FotoReferencia` — nueva (S1-05)

| Columna | Tipo | Qué es |
|---|---|---|
| `renglonId` | FK | La partida del plan a la que pertenece. |
| `posicion` | `INT`, CHECK 1 o 2 | Con el índice único `(renglonId, posicion)`, no caben tres fotos ni con dos subidas simultáneas. |
| `clave` | `TEXT` único | Dónde quedó el archivo en el almacenamiento (`fotos/<renglon>/<uuid>.jpg`). La arma el motor, nunca el navegador. |
| `nombreOriginal` | `TEXT` | Para mostrarlo; no se usa como ruta. |
| `tipo` | CHECK `image/jpeg` o `image/png` | Decidido por el contenido del archivo (D-11). |
| `bytes` | CHECK `> 0` y `≤ 5,242,880` | 5 MB. |

El archivo vive detrás de `lib/almacenamiento` (D-12), no en la base.

### `Exhibicion` — una columna nueva (S1-08)

| Columna | Tipo | Para qué |
|---|---|---|
| `intentosRechazados` | `INT`, default 0 | El siguiente cobro es el intento `intentosRechazados + 1` y ese número va en la llave de idempotencia (D-13). Sube sólo con un rechazo, nunca con un pendiente. |

### `PrecioPartida` — datos nuevos

La cocina ya tiene precio de lista por prototipo, derivado de Casa Lista
(D-04). No es un cambio de esquema: son 13 filas más.

## Migraciones del sprint

| Migración | Qué hace | Cuándo (calendario del plan) |
|---|---|---|
| `20260927170210_renglones_plan` | Crea `RenglonPlan`, `ModalidadPlan`, `OrigenRenglon`, `Proyecto.minimoPlan`, `Exhibicion.intentosRechazados`; `Plan.precioId` opcional. **Traslada datos**: precio derivado de la cocina, renglones de los planes existentes (DU-001 conserva sus $176,200) y un evento `plan_migrado_a_renglones` por plan. Verifica R7 al final. | «Lunes» (renglones del plan) |
| `20260927172020_acabados_fotos` | `RenglonPlan.acabado`, `FotoReferencia` con sus CHECK. | «Jueves en la mañana» (acabados y fotos) |

La primera **se detiene y no deja nada a medias** si a algún plan existente
le falta un precio de lista para repartir (antes lo repartía entre las que sí
tenían y la suma cuadraba igual: bug encontrado y corregido el 27). Lo
prueba `prisma/migraciones.int.test.ts` contra `prisma/pruebas/estado-20260925.sql`,
un volcado de la base del 25.

Después de migrar: `npx prisma generate` corre solo con `migrate dev`, pero
**hay que reiniciar `npm run dev`**: el servidor que ya estaba corriendo se
queda con el cliente de Prisma viejo en memoria y truena con «Unknown field».

## Bitácora: eventos nuevos

Con `entidadTipo = "plan"`, salvo los tres del estado financiero, que van en
la unidad (`entidadTipo = "unidad"`). El estado de cuenta muestra los dos.

| `tipo` | Cuándo |
|---|---|
| `plan_cotizado` | Al generar el plan. El comentario dice la modalidad, el total y, si se quitó algo del paquete, el aviso con la diferencia. |
| `plan_migrado_a_renglones` | Lo deja la migración del 27, uno por plan que ya existía. |
| `anticipo_cobrado`, `exhibicion_cobrada` | Ahora llevan la referencia de la pasarela y, el anticipo, cuántas partidas se congelaron. |
| `cobro_rechazado` | El banco dijo que no. Código, explicación e intento. |
| `cobro_pendiente` | El banco pidió autenticación o el cobro está en proceso. |
| `cobro_sin_respuesta` | La pasarela no contestó. |
| `posible_doble_cargo` | Llegó un cargo confirmado distinto para una exhibición ya pagada. |
| `acabado_elegido` | Se eligió o cambió un acabado (con el anterior y el nuevo). |
| `foto_referencia_subida`, `foto_referencia_quitada` | |
| `plan_cancelado` | S1-13: se canceló la unidad y con ella el plan abierto. |
| `estado_financiero_cambiado` *(unidad)* | S1-13: cada transición del estado financiero, a mano o por un cobro, con el anterior, el nuevo y el motivo. |
| `estado_financiero_inesperado` *(unidad)* | S1-13: llegó un pago con la unidad en un estado desde el que no hay camino (cancelada). El pago se registra; el estado no se mueve. |
