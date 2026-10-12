# Pruebas de aceptación · los diez criterios (actividad Z)

Estado al domingo 11 de octubre, rama `sprint-3/integracion` (232 pruebas). Se vuelven a correr el
viernes 16 antes de la entrega. «Automática» = una prueba que corre con
`npm test`; «Demo» = se muestra en vivo.

| # | Criterio | Evidencia | Estado |
|---|---|---|---|
| 1 | Se contrata una canasta y el anticipo más las doce exhibiciones suman exactamente el precio congelado | `plan-partidas.int.test.ts`, `planes.test.ts` (todos los precios del catálogo), `extremo-a-extremo.int.test.ts` | ✅ Automática |
| 2 | No se puede cobrar sin contrato firmado, y el error dice qué falta | `cobros.int.test.ts` «R1: sin contrato no se cobra…» | ✅ Automática |
| 3 | Un cobro se ejecuta en modo prueba con la comisión separada en la misma transacción | Motor: la comisión va en cada cobro y se guarda en el `Pago` (`cobros.int.test.ts`). `pasarelaStripe` ya está (Charly, integrada con D-34): la comisión es lo que la plataforma no transfiere (`transferencias.int.test.ts`, «Pagos a Moretti»). Contra Stripe: `rechazo-y-reintento.stripe.test.ts`. | 🟡 Código listo · falta correr `npm run test:stripe` con llaves (Charly) |
| 4 | El mismo cobro enviado varias veces produce un solo cargo, y el mismo webhook reenviado no duplica nada | `cobros.int.test.ts` (tres envíos → un cargo; `aplicarCobroConfirmado` dos veces) y `comprobantes.int.test.ts` (webhook doble → un pago y un comprobante) | ✅ Automática (el webhook deduplica por `EventoStripe` y el barrido toma cada exhibición con una actualización condicionada, `barrido.int.test.ts`) |
| 5 | Un cargo rechazado se reintenta según su código, y uno que no debe reintentarse no se reintenta | Una regla por código (D-37): `reintentos.test.ts`, `barrido.int.test.ts` (fondos insuficientes reintenta, perdida/robada no, el consejo del banco manda) y contra Stripe en `rechazo-y-reintento.stripe.test.ts`. | ✅ Automática |
| 6 | Un abono extraordinario recalcula el plan, el histórico queda intacto y el estado de cuenta cuadra | `versiones.int.test.ts` (versión 2 cuadra al peso, la 1 consultable, R3), `recalculo.test.ts` (R7 al centavo en cientos de montos) | ✅ Automática + demo |
| 7 | El sistema rechaza una transición inválida y explica por qué | `estados.int.test.ts`, `operacion.test.ts`, `obra.int.test.ts` | ✅ Automática |
| 8 | No se puede pasar a producción un expediente que no está liquidado | `obra.int.test.ts` «EN_PRODUCCION requiere LIQUIDADO…» | ✅ Automática + demo |
| 9 | Cada pago genera su pendiente de comprobante con la fecha límite calculada | `comprobantes.int.test.ts`, `fiscal.test.ts` (fechas reales 2026–2029) | ✅ Automática + demo |
| 10 | La documentación permite que alguien ajeno instale el sistema | `docs/instalacion.md`, probado desde un clon limpio el 6 oct (180/180 pruebas) | ✅ · repetirlo el jueves 15 desde `main` ya fusionado |

**Resumen:** 9 de 10 listos. El 3 sólo espera que Charly corra la prueba
contra Stripe con sus llaves de prueba.

## Guion de la demo (borrador, 15 minutos)

1. **Sitio** (2 min): portada → cotizador → «Arma el tuyo» → el total y la mensualidad
   cambian partida por partida. Debajo del mínimo, el aviso de contado.
2. **Alta y R1** (2 min): back office → unidad libre → alta. «Cobrar
   anticipo» bloqueado: falta el contrato (criterio 2). Registrar contrato →
   cobrar con la tarjeta 4242 en el Payment Element → Apartado (criterio 3).
3. **El cobro que no duplica** (1 min): mostrar el mismo cobro tres veces en
   la prueba automática (criterio 4).
4. **Rechazo y reintento** (2 min): tarjeta 4000 0000 0000 9995 → rechazo en
   la bitácora → el barrido lo reintenta según su código (criterio 5).
5. **Adelanto** (2 min): vista previa → confirmar → versión 2 → la versión 1
   sigue ahí (criterio 6).
6. **Upgrade** (1 min): Confort → Plus, mismo número de mensualidades.
7. **Obra** (2 min): intentar «En producción» sin liquidar → el mensaje dice
   qué falta (criterios 7 y 8).
8. **Fiscal y pagos a Moretti** (2 min): pendientes por fecha límite;
   autorizar una transferencia (criterio 9).
8b. **Inicio del back office** (1 min): las gráficas (cobrado por mes,
   cartera, dinero de Moretti) — lo que pidió la retro.
9. **Cierre** (1 min): `npm test` en verde y la auditoría de seguridad.
