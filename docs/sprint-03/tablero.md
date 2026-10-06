# Tablero · Sprint 3 (12 – 16 oct) · «Cerrar, probar y documentar»

Adelantado el lunes 5 y martes 6 por Claude a nombre de Ethan, con la
instrucción de terminar lo de Ethan del Sprint 3 y dejar lo demás para la
revisión del **miércoles 7 con Charly**. Rama: `ethan/sprint-3` (sale de
`ethan/sprint-2`, que todavía no está en `main`).

| ID | Tarea (ClickUp) | Quién | Estado |
|---|---|---|---|
| T | Upgrade de paquete | Ambos | **Lado de Ethan hecho** (`0d43bd9`, 9 pruebas, D-35). El cobro de la diferencia pasa por la pasarela: con Stripe, Charly. |
| U | Reembolso con la casilla de la comisión | Charly | Por hacer. Con D-34: un pago retenido se reembolsa sin tocar a Moretti; uno transferido necesita revertir la transferencia. |
| V | Tablero de cobranza | Ethan | **Hecho** (`aa5b01d`). Falta sólo el dato de vigencia de tarjeta, que llega con P. |
| W | Extremo a extremo: los 13 cobros | Ambos | **Lado del motor hecho** (`aa5b01d`). Falta correrlo contra Stripe en modo prueba (Charly, depende de O y P). |
| X+Y | Documentación, diagramas y manuales | Ambos | **Lado de Ethan hecho**: `diagramas.md`, `instalacion.md` (probada desde un clon limpio), `manual-administracion.md`, `seguridad.md`; reglas y parámetros al día. Falta lo de Charly: mapa de webhooks, llaves, reintentos y costos. |
| Z | Pruebas de aceptación y entrega | Ambos | `aceptacion.md`: 7 de 10 criterios listos; 3 y 4 esperan Stripe, 5 espera P. Guion de la demo en borrador. |
| — | Retención y pagos a Moretti (D-34, nueva) | Ethan / Charly | **Lado de Ethan hecho** (`6e72ecf`, 4 pruebas). Falta `pasarelaStripe.transferir` (Charly). |
| — | Auditoría de seguridad (pedida el 6 oct) | Ethan | **Hecha** (`dd84522`): 8 hallazgos corregidos, 43/43 ataques contenidos, 8 riesgos para revisar. |

Pruebas: **180** en verde (eran 159 al cerrar el Sprint 2). `tsc`, `eslint`
y `next build` limpios. `npm audit --omit=dev`: 0 vulnerabilidades.
