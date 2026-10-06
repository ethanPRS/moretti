# Tablero · Sprint 2 (5 – 9 oct) · «Que cobre solo y aguante rebotes»

Fuente de las tareas: ClickUp, lista «Sprint 2 · 5–9 oct». Rama de Ethan:
`ethan/sprint-2` (sale de `main` con el PR #3). Actualizado: lunes 5, noche.

| ID | Tarea | Quién | ClickUp | Estado |
|---|---|---|---|---|
| Q | Reglas cruzadas de las tres máquinas de estado | Ethan | complete | **Hecha** · `282bd41` · 24 pruebas · falta revisión de Charly |
| R | Adelanto y liquidación con versionado del plan | Ethan | complete | **Hecha** · `fd867fa` · 18 pruebas · falta revisión de Charly |
| S | Pendiente de comprobante fiscal con fecha límite | Ethan | complete | **Hecha** · `f6dd2e4` · 12 pruebas · falta revisión de Charly |
| O | Cobro programado de las mensualidades | Charly | complete (4 oct) | **Sin código en GitHub** (I-6) |
| P | Reintentos por código de rechazo y aviso de tarjeta por vencer | Charly | to do | Por hacer. Sigue sin respuesta qué códigos se reintentan (I-7). |
| W + X | Pruebas, revisión cruzada, documentación, review y retro | Ambos | in progress | Lado de Ethan: pruebas y documentación del versionado hechas. Falta: revisión cruzada, tabla de reintentos (Charly), review, retro y confirmar el alcance del Sprint 3. |

## Criterios de «terminada» y cómo se cumplieron

| ID | Criterio (ClickUp) | Evidencia |
|---|---|---|
| Q | Cada regla tiene su prueba y el mensaje de error nombra el requisito que falta. | `operacion.test.ts` (una por regla, con el texto exacto) y `obra.int.test.ts`. |
| R | El estado de cuenta cuadra al peso después del recálculo y la versión anterior sigue consultable. | `versiones.int.test.ts`: total vigente $147,300 tras el adelanto; versión 1 con sus 13 exhibiciones. Probado también en el navegador. |
| S | Cada pago genera su pendiente con la fecha correcta, y uno próximo a vencer se distingue a simple vista. | `comprobantes.int.test.ts`, `fiscal.test.ts`; pantalla Fiscal con chips «Vencido», «Vence hoy / en N días» (ámbar) y «En N días». |

## Verificación del lunes 5

- `npm test`: 16 archivos, **159 pruebas** en verde (105 → 159).
- `tsc --noEmit` y `eslint`: limpios. `next build`: compila.
- En el navegador (servidor local, plan de prueba): vista previa del adelanto
  de $20,000 → 12 a 10 exhibiciones; confirmar → versión 2 vigente con la 1
  consultable; pantalla Fiscal con un pendiente «Vence hoy» y otro «En 31 días».

## Backlog nuevo (descubierto, no comprometido)

| # | Qué | Por qué |
|---|---|---|
| B-9 | Deshacer un paso operativo marcado por error, con motivo | Hoy las máquinas no retroceden (D-22); corregir es a mano en la base. |
| B-10 | Pendientes fiscales para los pagos anteriores al 5 de oct | La migración no los crea (en desarrollo sólo hay datos de prueba). |
| B-11 | Que el adelanto y la liquidación se cobren fuera de sesión con Stripe | Hoy usan la pasarela del motor; depende del cobro fuera de sesión de Charly (O). |
| B-12 | El campo de monto del adelanto ocupa todo el ancho | Estilo global de `input`; cosmético. |
