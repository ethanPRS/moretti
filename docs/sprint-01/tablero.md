# Sprint 1 · «Que cobre de verdad» · tablero

Lunes 28 de septiembre al viernes 2 de octubre de 2026 · Ethan (SM y
desarrollo) y Charly (pagos) · Review el viernes 2, 16:00.

> **Cómo se hizo lo de Ethan.** Todas las historias de Ethan se trabajaron el
> domingo 27, antes del arranque, por Claude a nombre de Ethan, con la
> instrucción de hacer el sprint completo, documentarlo y tomar las
> decisiones necesarias para que Ethan las revise el lunes 28. Por eso:
> - Todo está en ramas locales sin subir (`sprint-0/cierre` → `sprint-1/ethan`).
> - «Hecho» aquí quiere decir *construido y probado*; para la definición de
>   terminado del equipo falta que **Ethan revise** y **Charly haga la
>   revisión cruzada** (checklist en `revision-cruzada.md`).
> - Las horas de abajo son las estimadas en el plan, no horas reales de Ethan.

Estados: **Por hacer** · **En curso** · **Hecho, falta revisión** (construido
y probado, esperando revisión cruzada) · **Terminado** (cumple la definición
de terminado) · **Bloqueado**.

## Lo comprometido

| ID | Historia | Quién | Est. | Estado |
|---|---|---|---:|---|
| S1-01 | Ratificar el contrato motor y pasarela | Ambos | 1 + 1 h | **Hecho de lado de Ethan; falta que Charly ratifique** (lun 28, 9:15) |
| S1-02 | Plan sobre lista de partidas, con precio congelado por renglón | Ethan | 5 h | **Hecho, falta revisión** |
| S1-03 | Las tres reglas de armado y el mínimo por proyecto | Ethan | 4 h | **Hecho, falta revisión** |
| S1-04 | Alta con paquete cerrado o «Arma el tuyo» | Ethan | 3.5 h | **Hecho, falta revisión** |
| S1-05 | Acabado elegido y fotos de referencia por partida | Ethan | 4.5 h | **Hecho, falta revisión** |
| S1-06 | Guardar la tarjeta del comprador | Charly | 4.5 h | Por hacer (Charly) |
| S1-07 | Cobro del anticipo como cargo directo, con la comisión separada | Charly | 5.5 h | Por hacer (Charly) |
| S1-08 | El motor cobra a través de la pasarela (en pareja) | Ambos | 2 + 2 h | **Mitad del motor hecha**; falta la sesión en pareja para enchufar Stripe (mié 30, 15:00) |
| S1-09 | Llave de idempotencia con número de intento | Charly | 2 h | Por hacer (Charly). El motor ya manda el intento y la llave está en el contrato. |
| S1-10 | Webhooks de Connect | Charly | 6 h | Por hacer (Charly). El motor ya expone `aplicarCobroConfirmado` y `registrarCobroRechazado`. |
| S1-11 | Pruebas del sprint y revisión cruzada | Ambos | 1 + 1 h | **Pruebas de Ethan hechas** (105 pasan); falta la revisión cruzada |
| S1-12 | Documentar lo construido | Ambos | 1 + 1 h | **Hecho de lado de Ethan** |
| SM | Tablero, impedimentos y perseguir decisiones | Ethan | 1.5 h | **En curso**: este tablero, `impedimentos.md`, `bitacora-diaria.md` |

## Si alcanza

| ID | Historia | Quién | Est. | Estado |
|---|---|---|---:|---|
| S1-13 | Máquina financiera: AL_CORRIENTE, SUSPENDIDO y CANCELADO | Ethan | 4 h | **Hecho, falta revisión.** Se tomó después de terminar lo comprometido de Ethan, como pide la regla. Si en la revisión no convence, se saca sin afectar lo demás (commit `6e01e52`). |
| S1-14 | Vista de Pagos con los cobros reales de Stripe | Charly | 1.5 h | Por hacer (Charly) |

---

## Criterios de aceptación, uno por uno

### S1-01 · Ratificar el contrato motor y pasarela — commit `c9e6d31`

- [x] La firma de cobrar y sus tipos quedan en el repositorio — `lib/pasarela/contrato.ts`, **v2**. Falta la aprobación de Charly: `docs/contrato-pasarela.md`.
- [x] La llave de idempotencia incluye el número de intento — `llaveIdempotencia()`; prueba en `contrato.test.ts`.
- [x] Queda decidido si guardar la tarjeta pasa por la interfaz — **sí** (D-01): `prepararTarjeta`.
- [x] Escrito en la bitácora dónde vive la tarjeta o qué variante provisional se usa — D-02: plataforma y clonar a Moretti al cobrar (plan B).

### S1-02 · Plan sobre lista de partidas — commit `0c04a2a`

- [x] Cada plan tiene renglones: partida, cantidad, precio de lista y precio congelado — tabla `RenglonPlan`.
- [x] La suma de los renglones es igual al monto congelado, al peso (R7) — en los 52 paquetes, 312 quitas y 6,643 canastas; en base y en la migración.
- [x] El plan de ejemplo DU-001 (Confort) se migra y conserva sus $176,200 — `prisma/migraciones.int.test.ts` contra el volcado de la base del 25.
- [x] Cobrar el anticipo congela la lista completa (R2) — `plan-partidas.int.test.ts` › «R2…»: se cambian lista y paquete después del anticipo y el plan no se mueve renglón por renglón.

### S1-03 · Reglas de armado y mínimo por proyecto — commit `0c04a2a`

- [x] Agregar una partida a un paquete cerrado suma su precio de lista.
- [x] Quitar una partida recalcula todo a lista y muestra el aviso con la diferencia (en el alta y en la bitácora).
- [x] Una canasta desde cero se cotiza como «Arma el tuyo».
- [x] Con un total menor al mínimo no se genera plan, y el mensaje lo explica.
- [x] El mínimo se lee de `Proyecto.minimoPlan`, no de una constante — `MINIMO_PLAN` se borró; verificado con el servidor de producción cambiando el valor en la base.

### S1-04 · Alta con paquete cerrado o «Arma el tuyo» — commits `f77f9cb`, `fbb0d26`

- [x] En el alta se elige un paquete cerrado o se arma la canasta con la misma lista del cotizador — `components/CanastaEditor.tsx`, el mismo en los dos.
- [x] Para la misma canasta, el alta y el sitio dan el mismo total — misma función de carga y de cotización; prueba en los 13 prototipos. Visto también en el navegador: DEPA 2R «Arma el tuyo» = $98,400 / $29,520 / $5,740 en los dos.
- [x] El plan resultante guarda la lista de partidas, nunca «paquete 5».

### S1-05 · Acabado elegido y fotos de referencia — commit `7495579`

- [x] En cada partida con acabados se elige uno.
- [x] Hasta dos fotos por partida (JPG o PNG, máximo 5 MB); la tercera se rechaza con un mensaje claro — también en la base (CHECK) y con subidas simultáneas.
- [x] Después del levantamiento no se cambia ni el acabado ni las fotos, y el error dice por qué (R6).
- [x] Las fotos se guardan detrás de una interfaz de almacenamiento con implementación local — `lib/almacenamiento/`; una prueba corre el motor con un almacén en memoria.

### S1-08 · El motor cobra a través de la pasarela — commits `8498281`, `aedef9b`

- [x] `cobrarAnticipo` y `cobrarExhibicion` llaman a `pasarela.cobrar` y guardan la referencia en el pago.
- [x] Si el cobro falla, la exhibición sigue pendiente y queda un evento en la bitácora con el código de rechazo.
- [x] Con la pasarela falsa, las seis pruebas actuales siguen pasando.
- [ ] **Sesión en pareja**: conectar la pasarela real (`lib/pasarela/index.ts`) cuando S1-07 esté. Propuestas para la rama de Charly en `notas-para-charly.md`.

### S1-13 · Máquina financiera (si alcanza) — commit `6e01e52`

- [x] Transiciones permitidas: APARTADO → AL_CORRIENTE → LIQUIDADO; AL_CORRIENTE ↔ SUSPENDIDO; cualquiera → CANCELADO.
- [x] Una transición inválida se rechaza y el mensaje dice cuál sí procede.
- [x] Cada transición deja evento en la bitácora.
- Además: a mano sólo se suspende, se reactiva o se cancela (APARTADO y LIQUIDADO los provocan los cobros); cancelar exige motivo y cancela el plan; un pago ya cobrado nunca se rechaza por el estado.

---

## Lo que se encontró y se corrigió en el camino

| Qué | Dónde | Commit |
|---|---|---|
| La migración repartía el precio entre las partidas con precio si a otra le faltaba, y la suma cuadraba igual: el plan quedaba con partidas de menos sin que nadie lo notara. Ahora se detiene y se revierte completa. | migración `renglones_plan` | `0c04a2a` (se encontró probando, antes del commit) |
| Un pago que llegaba con el plan cancelado lo reabría. | `aplicarPago` | `6e01e52` |
| En producción el sitio y cuatro páginas del back office se compilaban estáticas: el mínimo y los precios no se habrían actualizado. | páginas con `connection()` | `6d0a5f6` |
| Dos altas simultáneas chocaban por el folio y la API contestaba un error falso. | `darDeAlta` | `fbb0d26` |
| Un comprador quedaba registrado sin plan si la canasta no pasaba (ahora es más probable con el mínimo). | `darDeAlta` es atómica | `0c04a2a` |
| Un precio con centavos capturado en el back office podía tumbar el cotizador. | `/api/precios` | `4beb82d` |
| El registro del contrato no aparecía en la bitácora del estado de cuenta. | página del plan | `6e01e52` |

## Backlog nuevo (descubierto en el sprint, no comprometido)

Para el refinamiento del miércoles 30. Ninguno bloquea este sprint.

| # | Qué | Por qué | Sugerencia |
|---|---|---|---|
| B-1 | Recotizar un plan antes del anticipo | Hoy, para cambiar la canasta hay que dar de alta de nuevo. Trampa: si ya hubo un intento de cobro, cambiar el monto con la misma llave hace que Stripe rechace la petición (D-15). | Sprint 2, junto con P. |
| B-2 | Pasar la canasta del sitio al alta | «Quiero apartarlo» todavía no hace nada; en la demo, la canasta se vuelve a marcar en el alta. | Liga con la canasta en la URL, o el flujo «Apartar» de la spec §10. |
| B-3 | Sesión en `/admin` y en `/api/fotos` | Las fotos de referencia se sirven sin autenticar, igual que todo el back office. | Con el login (recomendación del plan del Sprint 0). |
| B-4 | `DESCUENTO_CONTADO` (8 %) está escrito en el código | Parámetro comercial; además la spec dice «sin descuento» al liquidar. | Preguntar a Ana Cris; moverlo a `Proyecto`. |
| B-5 | Fechas de exhibición con `setMonth` | Un plan creado el 31 corre las fechas (31 ene + 1 mes = 3 mar). Viene del Sprint 0. | Anclar al último día del mes. |
| B-6 | Elegir proveedor de almacenamiento antes de producción | En un despliegue sin disco las fotos se pierden (riesgo 6). | S3, Vercel Blob o Supabase; es otra implementación de `Almacenamiento`. |
| B-7 | Marcar el levantamiento desde el back office | Hoy R6 se prueba cambiando el estado operativo en la base; no hay botón. | Con la máquina operativa. |
| B-8 | Folio por secuencia de la base | Hoy es «contar + 1» con reintento; funciona porque los compradores no se borran. | Una secuencia de Postgres cuando haya bajas. |
