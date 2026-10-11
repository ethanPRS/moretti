# Prueba con dinero real · propuesta para Ana Cris

Preparado el domingo 11 oct para decidirlo el lunes 12 con Charly. Nada de esto
está activado: el código sólo acepta llaves de prueba (`sk_test_`) y el webhook
rechaza eventos reales (D-44).

## Para qué

En modo prueba ya se cubre casi todo (`npm test`, `npm run test:stripe`). Lo
que sólo se ve con dinero real:

1. Que la cuenta de la plataforma está **verificada** y puede cobrar en MXN.
2. Que una tarjeta mexicana real pasa (3-D Secure del banco, Radar).
3. Que la **transferencia a Moretti** llega a su cuenta conectada (D-34).
4. Cuánto cobra Stripe de verdad por cargo, para fijar la comisión del canal.
5. Que un reembolso regresa a la tarjeta.

## Lo que se le pide a Ana Cris

| Qué | Por qué |
|---|---|
| **$1,000 MXN** de presupuesto, pagados con su tarjeta en 4 cargos de $100 a $250 | Cubre los cargos de prueba. Casi todo regresa con los reembolsos; lo que **no** regresa son las tarifas de Stripe. |
| Datos para verificar la cuenta **real** de la plataforma: razón social, RFC, representante legal, CLABE | Stripe no deja cobrar en modo real sin verificar la cuenta. |
| Que Moretti complete el alta de su cuenta conectada real (datos fiscales y CLABE) | Es el destino de la transferencia. |
| Su autorización por escrito (correo) para hacer los cargos | Queda en el expediente. |

**Costo estimado que no regresa:** unos $40–60 MXN en tarifas (≈3.6 % + $3 MXN +
IVA por cargo exitoso; Stripe no devuelve la tarifa al reembolsar). **Verificar
la tarifa vigente en stripe.com/mx/pricing** antes de mandarle la cifra.

## Los cargos (orden propuesto)

| # | Qué | Monto | Qué se revisa |
|---|---|---|---|
| 1 | Anticipo de un plan de prueba (proyecto «Prueba real», precios bajos) | $100 | Cobro en la plataforma, 3DS, webhook, pendiente fiscal |
| 2 | Mensualidad 1 fuera de sesión (barrido) | $100 | Cobro sin el comprador presente |
| 3 | Transferencia a Moretti de lo retenido | neto de 1 y 2 | Llega a su cuenta (D-34) |
| 4 | Reembolso de un cargo **no** transferido | $100 | Regresa a la tarjeta; queda el `Reembolso` |
| 5 | (Opcional) un cargo de $250 y su reembolso | $250 | Monto mayor / Radar |

Después: reembolsar lo que quede y pedirle a Moretti que regrese la
transferencia (o descontarla), para que a Ana Cris sólo le cueste la tarifa.

## Qué hay que cambiar en el código (Ethan + Charly, lunes)

Es poco, y a propósito no se hizo sin ustedes:

- Aceptar `sk_live_` / `pk_live_` **sólo** con una bandera explícita
  (`STRIPE_MODO_REAL=1`) y con un **tope por cobro** (p. ej. $300 MXN).
- Que el webhook acepte `livemode` sólo con esa bandera.
- Un aviso rojo en el back office mientras esté en modo real.
- Correrlo en un ambiente aparte (no en la máquina de desarrollo), con su
  propia base, y apagar la bandera al terminar.

## Riesgos

- Una llave real en un `.env` de desarrollo: usar una **llave restringida**
  (`rk_live_`) con sólo los permisos necesarios y borrarla al terminar.
- El dinero retenido es de Moretti (D-34): conciliar el saldo de Stripe contra
  «Pagos a Moretti» al cerrar la prueba.
- I-11 sigue abierto: quién emite el CFDI cuando cobra la plataforma. Para una
  prueba de $100 no bloquea, pero hay que dejarlo anotado.
