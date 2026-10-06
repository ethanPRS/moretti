# Impedimentos y pendientes externos · Sprint 1

Lo revisa el Scrum Master en cada daily. Cada renglón con responsable y fecha.
Actualizado el domingo 27 de septiembre, al cerrar el trabajo de Ethan.

## Impedimentos del equipo

| # | Impedimento | Afecta | Responsable | Qué se hace | Estado |
|---|---|---|---|---|---|
| I-1 | El contrato motor ↔ pasarela cambió a v2 y Charly no lo ha visto. | S1-01, S1-07, S1-09, S1-10 | Ethan | Revisarlo juntos el lunes 9:15 con `docs/contrato-pasarela.md`. | Abierto |
| I-2 | La rama de Charly sale del `main` del 10 de sep: choca con `/admin`, el esquema y `planes.ts`, y su migración agrega `minimoPlan` otra vez (la base truena si se aplican las dos). | Integración | Charly, con apoyo de Ethan | Rebasar sobre `sprint-1/ethan` siguiendo `notas-para-charly.md` §2. | Abierto |
| I-3 | Nada del Sprint 0 ni del Sprint 1 está en GitHub. | Todo | Ethan | Revisar las ramas, hacer `git push` y abrir los PR (ver abajo). | Abierto — primer acto del lunes |
| I-4 | La base de desarrollo de Charly no tiene las migraciones del 25 y del 27. | Charly | Charly | Después de rebasar: `npx prisma migrate reset` (recrea y siembra). | Abierto |

### Para cerrar I-3 (lo hace Ethan)

```bash
cd prototipo
git log --oneline main..sprint-1/ethan      # revisar los commits (4 del Sprint 0 + los del Sprint 1)
git push -u origin sprint-0/cierre
git push -u origin sprint-1/ethan
# PR 1: sprint-0/cierre → main   (el trabajo del 25)
# PR 2: sprint-1/ethan → sprint-0/cierre   (el Sprint 1 de Ethan; Charly revisa)
```

## Pendientes de fuera (sección 11 del plan)

| Qué | De quién | Para cuándo | Qué bloquea | Estado al 27 |
|---|---|---|---|---|
| Dónde vive la tarjeta | Ana Cris / abogado | Lun 28 | S1-06 y S1-07 (con plan B) | Sin respuesta. **Variante provisional escrita en D-02** (plataforma + clonar); no bloquea. |
| Estado de las cuentas de Stripe Connect | Charly | Lun 28 | S1-07 (con plan B) | Sin evidencia en el repo. Plan B: cuenta conectada de prueba. |
| Confirmar que los precios por partida de la maqueta 5b son definitivos | Ana Cris / Moretti | Mié 30 | Nada | Sin respuesta; se trabaja con los de la maqueta. |
| Comisión al reembolsar, reintentos y códigos que se reintentan | Ana Cris / operación | Vie 2 | P y U (sprints 2 y 3) | Sin respuesta. Ningún código los usa todavía (`docs/parametros.md`). |
| Catálogo con fotos y fichas completas | Moretti | Sin fecha | Nada | Se muestra «Lo define Moretti». |

## Preguntas nuevas para Ana Cris (salieron al construir)

Van en el mismo correo que los pendientes de arriba. Ninguna bloquea el
sprint: para cada una hay una decisión provisional escrita.

1. **Precio de lista de la cocina.** La maqueta no lo trae y la regla de
   «quitar» lo necesita. Provisional: el que le queda a Casa Lista después de
   restar clósets y carpintería (D-04; en el DEPA 2R, $78,000). ¿Moretti
   tiene uno?
2. **Descuentos de paquete de $0 a $400.** Con los precios de la maqueta, un
   paquete cerrado cuesta entre $0 y $400 menos que sus partidas a lista
   (tabla en `docs/reglas.md`). ¿Es a propósito o es redondeo? Si es
   redondeo, «quitar una partida» casi no le cuesta nada al comprador.
3. **¿Se puede vender la cocina suelta?** Hoy «Arma el tuyo» nunca lleva
   cocina, ni en el back office (D-08). La spec dice «o la agrega a lista».
4. **La diferencia de la maqueta en «Arma el tuyo».** El sistema usa la suma
   de las partidas ($98,400 en el DEPA 2R) y no el «desde» de la tarjeta
   ($98,100). Ya estaba en el plan del sprint; sigue abierta.
5. **Descuento de contado del 8 %.** El sitio lo ofrece y está escrito en el
   código; la spec dice «sin descuento» al liquidar. ¿Se queda? ¿Es por
   proyecto?

## Riesgos del sprint (sección 09) — cómo quedaron

| Riesgo | Estado |
|---|---|
| La decisión de dónde vive la tarjeta no llega el lunes | Mitigado con D-02. |
| La cuenta conectada de Moretti no está activa | Sin cambio (Charly). |
| Un reintento devuelve el mismo rechazo sin reintentar | Resuelto en el contrato y probado en el motor: el siguiente intento va con llave nueva. |
| Los webhooks no llegan | Sin cambio (Charly). Nota de la sección 08 copiada en `notas-para-charly.md`. |
| Dos migraciones el mismo día | Las dos de Ethan están hechas y probadas; **la de Charly se tiene que renombrar** (I-2). |
| Las fotos en disco local se pierden al desplegar | Sin cambio; B-6 en el backlog. |
| El desarrollo se come el rol de Scrum Master | Este archivo y el tablero están al día al arrancar la semana. |
