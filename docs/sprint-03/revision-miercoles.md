# Para revisar el miércoles 7 · Ethan y Charly

Lo que quedó como revisión del trabajo adelantado el 5 y 6 de octubre. En
orden de importancia. Cada punto dice dónde verlo.

## 0. Recordatorio de Ethan

- **I-11: quién emite el CFDI al comprador** ahora que cobra la plataforma
  (D-33/D-34). Ethan lo revisa con Ana Cris. Afecta a S (a nombre de quién
  van los pendientes fiscales) y quizá agrega un comprobante entre la
  plataforma y Moretti.

## 1. Decidir juntos

1. **Forma del cobro con D-34 (retener).** Charly: PaymentIntent en la
   plataforma sin `transfer_data` ni `application_fee_amount`;
   `pasarelaStripe.transferir` nuevo. Detalle en
   `docs/sprint-02/notas-para-charly.md` §7.
2. **R-1 · el sitio público no puede cobrar el anticipo**: 
   `create-payment-intent` pide sesión de admin y el comprador recibiría 401.
   Propuesta: token de un solo uso que devuelve `/api/apartar`
   (`docs/seguridad.md`).
3. **R-3 · apartados sin anticipo ocupan la unidad para siempre.** ¿Se
   liberan a las 24 o 48 h? ¿Lo hace el barrido de O?
4. **R-8 · nunca desplegar con la pasarela simulada.** ¿Candado en
   `lib/pasarela/index.ts` para `NODE_ENV=production`?
5. **R-4 · roles**: hoy cualquiera con la contraseña autoriza pagos a Moretti.

## 2. Revisión cruzada (Charly revisa lo de Ethan)

Ramas `ethan/sprint-2` (Q, R, S) y `ethan/sprint-3` (T, V, W, D-34,
seguridad, docs). Lo que más conviene mirar:

| Qué | Archivo | Por qué |
|---|---|---|
| Cambios en código de Charly | `lib/motor/planes.ts` → `confirmarCobroStripe` | Ahora pasa por la máquina, no reabre cancelados y crea el pendiente fiscal (D-24, D-31). |
| Versionado | `lib/motor/versiones.ts`, `upgrade.ts` | La reversión cuando el banco rechaza (D-28, D-35). |
| Retención | `lib/motor/transferencias.ts` | Reserva de pagos, reintento con la misma llave. |
| Contrato de la pasarela | `lib/pasarela/contrato.ts` | Método nuevo `transferir`. |
| Seguridad | `proxy.ts`, `lib/limite-intentos.ts`, `lib/ip.ts`, `next.config.ts` | Rutas públicas, frenos, CSP. |
| Ruta eliminada | `app/api/apartar/anticipo` | Era pública y cobraba cualquier plan (H-2). |

## 3. Ratificar (Ethan)

Decisiones D-22 a D-35 en `docs/decisiones.md`, marcadas «Por ratificar».

## 4. Lo que es de Charly y bloquea la entrega

| Qué | Bloquea |
|---|---|
| `pasarelaStripe` (`cobrar`, `prepararTarjeta`, `transferir`) con D-34 | Criterios 3 y 4, W contra Stripe, demo |
| O · cobro programado (está *complete* en ClickUp sin código, I-6) | W, V (vencidas reales) |
| P · reintentos por código y tarjeta por vencer | Criterio 5, alertas de V |
| R-2 · webhook sin `event.account` y deduplicación con el índice único | Criterio 4 |
| U · reembolso con casilla de comisión | Sprint 3 |
| Su parte de X+Y: webhooks, llaves, reintentos, costos | Criterio 10 |

## 5. Para Ethan, fuera del código

- Disco de la máquina al 100 % (1.3 GB libres). Se pueden borrar sin perder
  nada: `../moretti-s2` (748 MB, la rama ya está en `main`),
  `../moretti-rebase` (860 MB, rama ya integrada) y la carpeta temporal del
  clon de prueba (652 MB).
- Abrir los PR: `ethan/sprint-2` → `main` y después `ethan/sprint-3`.
