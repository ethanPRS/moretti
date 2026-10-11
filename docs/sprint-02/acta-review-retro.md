# Acta de review y retrospectiva · Sprint 2 (5 – 9 oct)

Cerrada el domingo 11 de octubre. Objetivo del sprint (ClickUp):
**«Que cobre solo y aguante rebotes».**

## Review

**¿Se cumplió el objetivo?** **Sí, en código; falta probarlo contra Stripe
con llaves reales de prueba.** El cobro programado (barrido), los reintentos
por código y la suspensión llegaron en la rama de Charly el 7 oct
(`charly-backend-final`) y se integraron el 11 con lo de Ethan
(`sprint-3/integracion`, D-40).

| ID | Tarea | Quién | Resultado | Evidencia |
|---|---|---|---|---|
| Q | Reglas cruzadas de las tres máquinas | Ethan | ✅ Hecha | `282bd41`, 24 pruebas |
| R | Adelanto y liquidación con versionado | Ethan | ✅ Hecha | `fd867fa`, 18 pruebas |
| S | Pendiente fiscal con fecha límite | Ethan | ✅ Hecha | `f6dd2e4`, 12 pruebas |
| O | Cobro programado de las mensualidades | Charly | ✅ Hecha (llegó el 7 oct) | `lib/motor/barrido.ts`, `barrido.int.test.ts`, `/api/cobranza/barrido` |
| P | Reintentos por código y aviso de tarjeta por vencer | Charly | ✅ Reintentos y vencimiento guardado · 🟡 el **aviso** al comprador (correo) queda fuera | `rechazos.ts`, `reintentos.ts`, `reintentos.test.ts`, D-37 |
| W + X | Pruebas, revisión y documentación | Ambos | ✅ Integración probada (232 pruebas), docs al día | este documento, `docs/integracion-stripe.md` |
| — | D-32/D-33/D-34: dónde vive la tarjeta y quién cobra | Ethan + Ana Cris | ✅ Decidido: cobra la plataforma y retiene | `decisiones.md` |

**Números al cierre:** 232 pruebas en verde (eran 159 al empezar el sprint),
`tsc`, `eslint` y `next build` limpios; auditoría de seguridad 45/45.

**No se terminó / pasa al Sprint 3:**

- Correr `npm run test:stripe` con llaves de prueba (Charly).
- Aviso al comprador de tarjeta rechazada o por vencer (correo): fuera del
  alcance del prototipo; queda en el backlog.
- Fusionar todo a `main` (ver «Ramas»).

## Retrospectiva

**Asistentes:** Ethan, Charly.

| | |
|---|---|
| **Qué funcionó** | Charly comentó que se ha sentido bien con la forma de trabajar: reparto claro motor (Ethan) / pasarela (Charly), decisiones por escrito y el contrato de la pasarela como frontera. |
| **Qué mejorar** | Única sugerencia: **agregar gráficas al panel de admin** para que sea más intuitivo. |
| **Acción** | Hecha el 11 oct: tres gráficas en el inicio del back office (cobrado por mes, estado de la cartera, dinero de Moretti). D-43. |
| **Lo que vio el SM** (para comentar el lunes) | Las ramas siguen divergiendo: `charly-backend-final` salió de una rama vieja y chocó en 18 archivos (D-22..D-25 repetidos, otro modelo de cargo, H-2 reabierto). Propuesta para el Sprint 3: **una sola rama de integración** (`sprint-3/integracion`) y cada quien abre sus ramas desde ahí. |

## Impedimentos al cierre

| # | Estado al 11 oct |
|---|---|
| I-5 · PRs #1 y #2 viejos | Falta cerrarlos en GitHub. |
| I-6 · O sin código | **Resuelto**: llegó en `charly-backend-final`. |
| I-7 · qué códigos se reintentan | **Resuelto por D-37** (regla por código, de Charly); falta que Ana Cris la confirme. |
| I-8 · revisión cruzada | Parcial: Ethan (Claude) revisó todo lo de Charly al integrarlo. Falta que Charly revise D-40..D-42. |
| I-11 · quién emite el CFDI | **Abierto.** Preguntar a Ana Cris y al contador. |
| I-12 (nuevo) · prueba con dinero real | Se le pedirá a Ana Cris; propuesta en `docs/sprint-03/prueba-dinero-real.md`. |

## Ramas

| Rama | Qué | Estado |
|---|---|---|
| `main` | Hasta el PR #3 (5 oct) | — |
| `ethan/sprint-2` → `ethan/sprint-3` | Lo de Ethan de los Sprints 2 y 3 | en GitHub, sin PR |
| `charly-backend-final` | Lo de Charly del 7 oct | en GitHub, sin PR |
| **`sprint-3/integracion`** | Las dos anteriores integradas + gráficas + D-40..D-44 | **la que se fusiona a `main`** (un solo PR) |
