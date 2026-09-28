# Revisión cruzada · lo de Ethan, para Charly

S1-11 y la definición de terminado: «cada historia terminada la revisó la
otra persona». Esto es para que la revisión de Charly no dependa de leer 60
archivos: por historia, qué mirar, cómo probarlo y qué decisión revisar.
Marca cada casilla o deja el comentario en el PR.

Antes de empezar:

```bash
git fetch && git checkout sprint-1/ethan
npm install && npx prisma migrate reset --force && npm test
npm run dev
```

## S1-01 · Contrato (lo que más te toca)

- [ ] Leer `docs/contrato-pasarela.md`: los seis cambios de la v2 y por qué.
- [ ] `lib/pasarela/contrato.ts`: ¿te sirve `estado: "pendiente"` para
      `requires_action` y `processing`? ¿Te falta algún dato en `SolicitudCobro`?
- [ ] ¿Estás de acuerdo con D-01 (tarjeta por la interfaz) y D-02 (variante
      provisional: plataforma + clonar)?
- [ ] Decisión: **ratificado** / **ratificado con cambios** (escribirlos en el PR).

## S1-02 · Plan sobre lista de partidas

- [ ] `prisma/schema.prisma`: `RenglonPlan`, `Plan.modalidad`, `Plan.precioId` opcional.
- [ ] La migración `20260927170210_renglones_plan`: la parte escrita a mano
      (precio derivado de la cocina, traslado de planes, verificaciones).
- [ ] `lib/motor/canasta.ts` › `repartir`: el reparto del precio del paquete (D-05).
- [ ] Probar: `/admin/planes/<DU-001>` muestra 4 renglones que suman $176,200.
- [ ] Decisión a revisar: **D-04** (precio de la cocina derivado).

## S1-03 · Reglas de armado y mínimo

- [ ] `lib/motor/canasta.ts` › `cotizar`: las tres reglas en una sola función.
- [ ] Probar en el alta: Confort → bajar climas → aviso de $200 y total $147,300.
- [ ] Probar en el sitio: «Arma el tuyo» con sólo carpintería y un clima → «Se paga de contado».
- [ ] Decisiones a revisar: D-06, D-07, D-08, D-09.

## S1-04 · Alta

- [ ] `app/admin/(panel)/unidades/[id]/alta/AltaForm.tsx` y `components/CanastaEditor.tsx`.
- [ ] Probar: misma canasta en el sitio y en el alta → mismo total.
- [ ] `darDeAlta` en `lib/motor/planes.ts`: comprador y plan juntos o nada;
      reintento de folio con altas simultáneas.

## S1-05 · Acabados y fotos

- [ ] `lib/motor/acabados.ts`, `lib/motor/fotos.ts`, `lib/almacenamiento/`.
- [ ] Probar: subir 2 fotos (el botón desaparece); una `.heic` renombrada a `.jpg` se rechaza.
- [ ] Revisar la ruta `app/api/renglones/[id]/fotos/route.ts` (límite de tamaño antes de leer el formulario).
- [ ] Decisiones a revisar: D-10, D-11, D-12.

## S1-08 · El motor cobra a través de la pasarela (la mitad del motor)

- [ ] `ejecutarCobro`, `aplicarPago`, `registrarCobroRechazado`,
      `aplicarCobroConfirmado` en `lib/motor/planes.ts`.
- [ ] ¿Tu webhook puede llamar a `aplicarCobroConfirmado` y
      `registrarCobroRechazado` con lo que trae el PaymentIntent? (necesitas
      `exhibicionId` e `intento` en la metadata).
- [ ] `lib/motor/cobros.int.test.ts`: ¿falta algún caso que Stripe haga y la
      pasarela falsa no?
- [ ] Decisión a revisar: **D-13** (número de intento en `Exhibicion`).

## S1-13 · Máquina financiera (si alcanza)

- [ ] `lib/motor/estados.ts`: la tabla de transiciones contra el criterio.
- [ ] Probar en el estado de cuenta: suspender, reactivar, cancelar sin motivo (debe pedirlo).

## Lo general

- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` y `npm run build` limpios en tu máquina.
- [ ] Mensajes de error: ¿alguno dice sólo «no se permite» sin decir qué falta?
- [ ] ¿Algo escrito a mano que la hoja 15 marque como parámetro? (`docs/parametros.md`)
