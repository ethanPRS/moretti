# Pruebas

## Cómo se corren

```bash
npm test                              # todo: unitarias + integración
npx vitest run --project unitarias    # sólo las puras, sin base (menos de un segundo)
npx vitest run --project integracion  # el motor contra Postgres
```

Las **unitarias** (`*.test.ts`) no tocan la base. Las de **integración**
(`*.int.test.ts`) corren contra una base aparte:

- Se llama como la de desarrollo con `_pruebas` en vez de `_dev`
  (`moretti_dev` → `moretti_pruebas`), o la que diga `DATABASE_URL_PRUEBAS`
  en `.env`.
- Antes de cada corrida se borra y se levanta desde cero con todas las
  migraciones (`prisma migrate reset`), así que cada corrida prueba también
  que las migraciones funcionan en una base vacía.
- Cada prueba vacía las tablas y siembra el catálogo real (`prisma/sembrar.ts`).
- **Candado**: si el nombre de la base no termina en `_pruebas` o `_test`, no
  corre nada. Las pruebas vacían la base; un `.env` mal copiado no puede
  borrar la de desarrollo.
- La prueba de la migración (`prisma/migraciones.int.test.ts`) crea además su
  propia base (`moretti_migracion_pruebas`) y necesita `psql`, `createdb` y
  `dropdb`; si no están instalados, se salta.

Charly: con Postgres local y tu `DATABASE_URL` en `.env` no hay que
configurar nada más. Si tu usuario de Postgres no puede crear bases, crea
`moretti_pruebas` a mano y pon `DATABASE_URL_PRUEBAS`.

## Qué cubre cada archivo

| Archivo | Tipo | Qué prueba |
|---|---|---|
| `lib/motor/planes.test.ts` | unitaria | Las **seis pruebas del Sprint 0** (regresión): plan de la spec, R7 en 32 precios, redondeo en la última, gemelo en enteros en 52 precios y 13,312 canastas. |
| `lib/motor/canasta.test.ts` | unitaria | Reglas de armado (S1-02, S1-03): reparto del paquete en los 52 casos, agregar, quitar en los 312 casos posibles, «Arma el tuyo» en las 6,643 canastas, mensajes, mínimo, levantamiento, precio derivado de la cocina. |
| `lib/pasarela/contrato.test.ts` | unitaria | Llave de idempotencia (S1-01) y que la pasarela falsa se porte como Stripe. |
| `lib/motor/fotos.test.ts` | unitaria | JPG/PNG por contenido, 5 MB, HEIC renombrada (S1-05). |
| `lib/motor/plan-partidas.int.test.ts` | integración | El plan guarda la lista (S1-02), R7 en los 52 paquetes, DU-001, R2 con la lista, reglas en el motor, mínimo desde el proyecto, alta atómica, **sitio y alta dan el mismo total** (S1-04). |
| `lib/motor/cobros.int.test.ts` | integración | El motor cobra a través de la pasarela (S1-08): referencia, centavos, R1, rechazo, reintento con llave nueva, tres envíos simultáneos = un cargo, pendiente + webhook, pasarela caída, doble cargo. |
| `lib/motor/acabados.int.test.ts` | integración | Acabado, fotos, tercera foto, subidas simultáneas, almacén en memoria, R6 (S1-05). |
| `lib/motor/estados.test.ts` · `estados.int.test.ts` | ambas | Máquina financiera (S1-13). |
| `lib/motor/reintentos.test.ts` | unitaria | Una regla por código de rechazo (los de la especificación tal cual), consejo del banco, código desconocido, umbral de suspensión. |
| `lib/motor/barrido.int.test.ts` | integración | Barrido de vencidas: cobra fuera de sesión sólo lo vencido, dos barridos a la vez = un cobro, no toca pendientes ni planes cancelados, vencida con evento; reintentos por código (insufficient_funds, generic_decline, stolen_card → tarjeta inválida, expired_card y la renovación del banco, consejo do_not_try_again); suspensión a la segunda vencida y reactivación. |
| `lib/motor/movimientos.int.test.ts` | integración | Reembolsos (back office con `devolverComision` explícito, Dashboard de Moretti, límites), disputas (suspenden, el barrido no cobra, ganada/perdida, cierre antes que apertura), comisión de Stripe, discrepancias de monto y comisión, cargo excedente. |
| `lib/pasarela/rechazo-y-reintento.stripe.test.ts` | Stripe (`npm run test:stripe`) | De extremo a extremo contra el modo prueba: tarjeta, anticipo con comisión, rechazo de la mensualidad y su reintento. Fuera de `npm test`; se salta sin `STRIPE_SECRET_KEY` y `STRIPE_E2E_CUENTA`. |
| `prisma/migraciones.int.test.ts` | integración | La migración del 27 contra la base del 25: DU-001 conserva $176,200; SQL y TypeScript reparten igual en 52 planes; si falta un precio se detiene sin dejar nada a medias. |

## La tabla de pruebas del plan del sprint (sección 08)

### Unitarias (las de Ethan)

| Prueba del plan | Dónde está | Estado |
|---|---|---|
| La suma de los renglones es igual al monto congelado, en todas las canastas del catálogo (R7 · S1-02) | `canasta.test.ts` (52 paquetes, 312 quitas, 6,643 «Arma el tuyo») · `plan-partidas.int.test.ts` (52 en base) | ✅ |
| Quitar una partida recalcula a precio de lista; agregar suma a precio de lista (S1-03) | `canasta.test.ts` · `plan-partidas.int.test.ts` | ✅ |
| Debajo del mínimo del proyecto no se genera plan (S1-03) | `canasta.test.ts` · `plan-partidas.int.test.ts` | ✅ |
| No se cambia el acabado ni las fotos después del levantamiento (R6 · S1-05) | `acabados.int.test.ts` | ✅ |
| Un cobro que la pasarela rechaza no marca pagada la exhibición (S1-08, ambos) | `cobros.int.test.ts` | ✅ con la pasarela falsa. Falta contra Stripe (Charly). |
| Las seis pruebas actuales siguen pasando (regresión) | `planes.test.ts` | ✅ |

### Contra el modo prueba de Stripe (las de Charly)

Ninguna se puede correr todavía: `lib/pasarela/stripe.ts` sigue sin
implementar en esta rama. Lo que el motor ya garantiza del lado de Ethan, con
la pasarela falsa:

| Caso del plan | Del lado del motor |
|---|---|
| Cobro exitoso con la comisión separada (4242) | Manda `comisionCentavos` calculado con el % del proyecto; lo guarda en el pago. |
| El banco pide autenticación (3155) | Con `estado: "pendiente"` no marca nada ni gasta intento. |
| Fondos insuficientes (9995) / rechazo genérico (0002) | Exhibición pendiente, rechazo en la bitácora, siguiente intento con llave nueva. |
| El mismo intento tres veces deja un cargo | Tres envíos simultáneos → un cargo en la pasarela y un pago en la base. |
| Un webhook reenviado no duplica nada | `aplicarCobroConfirmado` dos veces → aplica una. |
