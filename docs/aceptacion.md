# Pruebas de aceptación · los diez criterios (actividad Z)

Estado al martes 6 de octubre, rama `ethan/sprint-3`. Se vuelven a correr el
viernes 16 antes de la entrega. «Automática» = una prueba que corre con
`npm test`; «Demo» = se muestra en vivo.

| # | Criterio | Evidencia | Estado |
|---|---|---|---|
| 1 | Se contrata una canasta y el anticipo más las doce exhibiciones suman exactamente el precio congelado | `plan-partidas.int.test.ts`, `planes.test.ts` (todos los precios del catálogo), `extremo-a-extremo.int.test.ts` | ✅ Automática |
| 2 | No se puede cobrar sin contrato firmado, y el error dice qué falta | `cobros.int.test.ts` «R1: sin contrato no se cobra…» | ✅ Automática |
| 3 | Un cobro se ejecuta en modo prueba con la comisión separada en la misma transacción | Motor: la comisión va en cada cobro y se guarda en el `Pago` (`cobros.int.test.ts`). **Contra Stripe:** falta `pasarelaStripe` (Charly). Con D-34 la comisión es lo que la plataforma no transfiere; se demuestra en «Pagos a Moretti». | 🟡 Motor listo · falta Stripe modo prueba (Charly) |
| 4 | El mismo cobro enviado varias veces produce un solo cargo, y el mismo webhook reenviado no duplica nada | `cobros.int.test.ts` (tres envíos → un cargo; `aplicarCobroConfirmado` dos veces) y `comprobantes.int.test.ts` (webhook doble → un pago y un comprobante) | ✅ Automática · 🟡 R-2: deduplicación del webhook con concurrencia (Charly) |
| 5 | Un cargo rechazado se reintenta según su código, y uno que no debe reintentarse no se reintenta | El rechazo y su reintento con llave nueva: `extremo-a-extremo.int.test.ts`. **La política por código** (fondos insuficientes a los 3 y 7 días, genérico una vez, perdida/robada nunca) es la tarea P. | ❌ Falta P (Charly) |
| 6 | Un abono extraordinario recalcula el plan, el histórico queda intacto y el estado de cuenta cuadra | `versiones.int.test.ts` (versión 2 cuadra al peso, la 1 consultable, R3), `recalculo.test.ts` (R7 al centavo en cientos de montos) | ✅ Automática + demo |
| 7 | El sistema rechaza una transición inválida y explica por qué | `estados.int.test.ts`, `operacion.test.ts`, `obra.int.test.ts` | ✅ Automática |
| 8 | No se puede pasar a producción un expediente que no está liquidado | `obra.int.test.ts` «EN_PRODUCCION requiere LIQUIDADO…» | ✅ Automática + demo |
| 9 | Cada pago genera su pendiente de comprobante con la fecha límite calculada | `comprobantes.int.test.ts`, `fiscal.test.ts` (fechas reales 2026–2029) | ✅ Automática + demo |
| 10 | La documentación permite que alguien ajeno instale el sistema | `docs/instalacion.md`, probado desde un clon limpio el 6 oct (180/180 pruebas) | ✅ · repetirlo con alguien que no participó |

**Resumen:** 7 de 10 listos; el 3 y el 4 dependen de terminar la parte de
Stripe; el 5 es la tarea P de Charly.

## Guion de la demo (borrador, 15 minutos)

1. **Sitio** (2 min): `/cotizar` → «Arma el tuyo» → el total y la mensualidad
   cambian partida por partida. Debajo del mínimo, el aviso de contado.
2. **Alta y R1** (2 min): back office → unidad libre → alta. «Cobrar
   anticipo» bloqueado: falta el contrato (criterio 2). Registrar contrato →
   cobrar → Apartado (criterio 3 con Stripe en modo prueba, si ya está).
3. **El cobro que no duplica** (1 min): mostrar el mismo cobro tres veces en
   la prueba automática (criterio 4).
4. **Rechazo y reintento** (2 min): tarjeta 4000 0000 0000 9995 → rechazo en
   la bitácora → reintento según su código (criterio 5, cuando esté P).
5. **Adelanto** (2 min): vista previa → confirmar → versión 2 → la versión 1
   sigue ahí (criterio 6).
6. **Upgrade** (1 min): Confort → Plus, mismo número de mensualidades.
7. **Obra** (2 min): intentar «En producción» sin liquidar → el mensaje dice
   qué falta (criterios 7 y 8).
8. **Fiscal y pagos a Moretti** (2 min): pendientes por fecha límite;
   autorizar una transferencia (criterio 9).
9. **Cierre** (1 min): `npm test` en verde y la auditoría de seguridad.
