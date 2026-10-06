# Demo del viernes 2 · cómo se muestra y qué ya funciona

El guion es el de la sección 10 del plan del sprint. Al 27 de septiembre, lo
de Ethan se puede mostrar completo **con la pasarela falsa**; lo que dice
«panel de Stripe» necesita S1-06, S1-07, S1-09 y S1-10 de Charly.

## Preparar

```bash
cd prototipo
npx prisma migrate reset --force   # base limpia + seed (DU-001 incluido)
npm run dev                        # http://localhost:3000
```

> Si el servidor ya estaba corriendo cuando se migró, hay que reiniciarlo:
> se queda con el cliente de Prisma viejo y truena con «Unknown field».

## El guion

| # | Paso | Dónde | Estado al 27 |
|---|---|---|---|
| 1 | En el sitio, armar una canasta con «Arma el tuyo» para un DEPA 2R. | `/` › Cotiza › Barrio Roble › DEPA 2R › ✳ Arma el tuyo | ✅ Arranca en **$98,400** (clósets, carpintería y 3 climas): anticipo $29,520, 12 de $5,740. |
| 2 | En el back office, dar de alta al comprador con esa misma canasta: el total coincide con el del sitio. | `/admin/proyectos` › Barrio Roble › BR 718 › «Dar de alta» › ✳ Arma el tuyo | ✅ Mismos $98,400 / $29,520 / $5,740 (probado en el navegador y en la prueba de los 13 prototipos). |
| 3 | Elegir acabado y subir una foto de referencia en una partida a la medida. | Estado de cuenta › «Acabados y fotos de referencia» › Clósets | ✅ La tabla de partidas muestra el acabado; la bitácora, los dos eventos. Para mostrar el rechazo: subir un archivo que no sea JPG/PNG o de más de 5 MB. |
| 4 | Intentar cobrar el anticipo sin contrato: el sistema lo rechaza y dice qué falta (R1). | Estado de cuenta | ✅ El botón está deshabilitado y la nota dice que falta el contrato; la API contesta el mismo mensaje. |
| 5 | Registrar el contrato y cobrar con 4242: el cargo aparece en el panel de Stripe con la comisión separada. | Estado de cuenta | 🟡 **Con la pasarela falsa**: se cobra, el precio y la lista se congelan (R2), la unidad pasa a Apartado y la bitácora trae la referencia y la comisión. Contra Stripe: falta S1-07 y cambiar `lib/pasarela/index.ts`. |
| 6 | Mandar el mismo cobro tres veces: un solo cargo. | — | 🟡 Probado en el motor (tres envíos simultáneos → un cargo, un pago). Contra Stripe: S1-09. |
| 7 | Reenviar el webhook: el pago no se duplica. | — | 🟡 Del lado del motor, probado (`aplicarCobroConfirmado` dos veces aplica una). El endpoint es S1-10. |
| 8 | Cobrar con 4000 0000 0000 9995: rebota, la exhibición sigue pendiente y el rechazo queda en la bitácora. | — | 🟡 Probado en el motor con la pasarela falsa (`cobros.int.test.ts`). En pantalla, cuando esté Stripe. |
| 9 | Quitar una partida de un paquete cerrado: lo demás pasa a precio de lista y se avisa la diferencia. | Alta › Confort › bajar climas a 0 | ✅ «Al quitar Clima minisplit, Confort deja de ser paquete… Pagas $200 más…». El total pasa a $147,300 y la etiqueta a «sin precio de paquete». |

### Extra, si sobra tiempo (S1-13)

En el estado de cuenta, «Cambiar el estado financiero a mano»: suspender y
reactivar, o cancelar con motivo. Intentar marcar «Liquidado» a mano no se
ofrece; por la API contesta por qué no.

### Mostrar R6 (no hay botón todavía)

```bash
psql -d moretti_dev -c "update \"Unidad\" set \"estadoOperativo\"='LEVANTAMIENTO_HECHO' where numero='718';"
# recargar el estado de cuenta: acabado y fotos quedan fijos, con el motivo (R6)
psql -d moretti_dev -c "update \"Unidad\" set \"estadoOperativo\"='PENDIENTE' where numero='718';"
```

## Las cinco comprobaciones del objetivo (sección 01)

| # | Comprobación | Estado |
|---|---|---|
| 1 | Un plan se genera desde una lista de partidas y su suma cuadra al peso con el precio congelado. | ✅ |
| 2 | El cargo del anticipo aparece en el panel de Stripe, en la cuenta de Moretti, con la comisión separada. | ⏳ Charly (S1-07). El motor ya manda la comisión en centavos. |
| 3 | El mismo cobro enviado tres veces deja un solo cargo. | 🟡 Motor ✅; contra Stripe, Charly (S1-09). |
| 4 | El mismo webhook recibido dos veces aplica el pago una sola vez. | 🟡 Motor ✅; endpoint, Charly (S1-10). |
| 5 | Un cobro rechazado deja la exhibición pendiente y el rechazo queda en la bitácora. | 🟡 Motor ✅ con la pasarela falsa; contra Stripe, al enchufarla (S1-08 en pareja). |
