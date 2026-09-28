# Acta de review y retrospectiva · Sprint 1

**Borrador.** Se llena el viernes 2 de octubre (review 16:00, retro 16:50).
Lo que ya está escrito es el estado al domingo 27; hay que confirmarlo o
corregirlo en la reunión.

## Review · viernes 2 de octubre, 16:00

**Asistentes:** Ethan, Charly, *(Ana Cris / Moretti, si vienen)*

### Objetivo del sprint

> Al cerrar el viernes, un anticipo se cobra contra Stripe en modo prueba
> sobre una canasta armada partida por partida, la comisión del canal se
> separa en el mismo cargo, y mandar el mismo cobro tres veces deja un solo
> cargo.

**¿Se cumplió?** *(sí / parcialmente / no — por llenar)*

| # | Comprobación | ¿Se mostró? | Nota |
|---|---|---|---|
| 1 | Un plan se genera desde una lista de partidas y su suma cuadra al peso | | Listo desde el 27 |
| 2 | El anticipo aparece en el panel de Stripe con la comisión separada | | |
| 3 | El mismo cobro tres veces deja un solo cargo | | |
| 4 | El mismo webhook dos veces aplica el pago una vez | | |
| 5 | Un cobro rechazado deja la exhibición pendiente y el rechazo en la bitácora | | |

### Historias

| ID | ¿Terminada? (DoD) | Nota |
|---|---|---|
| S1-01 | | Falta ratificación de Charly al 27 |
| S1-02 | | |
| S1-03 | | |
| S1-04 | | |
| S1-05 | | |
| S1-06 | | |
| S1-07 | | |
| S1-08 | | |
| S1-09 | | |
| S1-10 | | |
| S1-11 | | |
| S1-12 | | |
| S1-13 (si alcanza) | | Construida el 27 |
| S1-14 (si alcanza) | | |

### Lo que no se terminó y vuelve al backlog (con la razón)

| ID | Razón | A qué sprint |
|---|---|---|
| | | |

### Cierre del viernes (anexo del plan)

- [ ] Las cinco comprobaciones del objetivo se pueden mostrar.
- [ ] Las pruebas nuevas y las seis anteriores pasan.
- [ ] Lint y chequeo de tipos limpios.
- [ ] Cada historia terminada la revisó la otra persona.
- [ ] Lo de Charly funciona contra el modo prueba de Stripe, no sólo contra la pasarela falsa.
- [ ] Toda migración se probó con reset y seed desde cero.
- [ ] La documentación de la sección 12 está en el repositorio.
- [ ] Lo que no se terminó volvió al backlog con la razón escrita.
- [ ] El estado de los pendientes externos (sección 11) está actualizado.
- [ ] Acta de review y acuerdo de la retro escritos.

## Retrospectiva · viernes 2 de octubre, 16:50

### Qué funcionó

-

### Qué no funcionó

-

### Un acuerdo concreto para el Sprint 2

> *(uno solo, con responsable)*

**Tema sugerido para la retro:** el trabajo de Ethan se adelantó completo el
domingo, antes del sprint. Bueno para la cadena crítica de Charly (el
contrato y el motor ya estaban listos el lunes); pero se construyó sin
planeación conjunta y concentra la revisión en Charly. ¿Queremos repetirlo o
preferimos que cada historia pase por el daily?
