# Tablero · Sprint 3 (12 – 16 oct) · «Cerrar, probar y documentar»

Última semana: entrega funcional a Ana Cris el **viernes 16**. Actualizado el
domingo 11 en la noche. Rama de trabajo: **`sprint-3/integracion`** (lo de
Ethan de los Sprints 2 y 3 + lo de Charly del 7 oct, integrados). Todo lo
nuevo sale de esa rama.

## Parte de Ethan: terminada

| ID | Tarea (ClickUp) | Estado | Evidencia |
|---|---|---|---|
| T | Upgrade de paquete (motor) | ✅ | `0d43bd9`, D-35, 9 pruebas. El cobro de la diferencia ya pasa por `pasarelaStripe`. |
| V | Tablero de cobranza | ✅ | `aa5b01d`. La vigencia de la tarjeta ya se guarda (llegó con P). |
| W | Extremo a extremo de los 13 cobros (motor) | ✅ | `extremo-a-extremo.int.test.ts`; la versión contra Stripe se adaptó a D-34. |
| X+Y | Documentación, diagramas, manuales | ✅ | `instalacion.md`, `manual-administracion.md`, `diagramas.md`, `seguridad.md`; `integracion-stripe.md` puesto al día con D-34. |
| Z | Aceptación y demo (lado de Ethan) | ✅ 9/10 | `aceptacion.md`, guion de 15 min. |
| — | Retención y pagos a Moretti (D-34) | ✅ | Motor + pantalla + `pasarelaStripe.transferir` (integración). |
| — | **Integrar `charly-backend-final`** | ✅ | `dd28bb0`: 18 archivos en conflicto resueltos, D-40..D-42. |
| — | **Gráficas del back office** (retro Sprint 2) | ✅ | `e8c51a7`, D-43. |
| — | Auditoría de seguridad otra vez | ✅ | 45/45 (H-2 reabierto por la integración y cerrado con D-41). |
| — | Propuesta de prueba con dinero real | ✅ | `prueba-dinero-real.md`, D-44. |

## Parte de Charly y de los dos: por hacer esta semana

| ID | Qué | Quién | Día |
|---|---|---|---|
| — | Revisar la integración (D-40, D-41, D-42) y aprobar el PR a `main` | Charly | lun 12 |
| W/Z-3 | Correr `npm run test:stripe` con llaves de prueba y la cuenta conectada | Charly | lun 12 – mar 13 |
| — | Probar los webhooks con `stripe listen` (lista en `integracion-stripe.md`) | Charly | mar 13 |
| U | Revertir la transferencia al reembolsar un pago ya transferido (`reversals`) y los botones de reembolso/captura/liberación | Charly | mar 13 – mié 14 |
| — | Modo real con bandera y tope, en ambiente aparte (si Ana Cris aprueba) | Ethan + Charly | mié 14 |
| — | Prueba con dinero real (4–5 cargos) | Ethan + Charly + Ana Cris | jue 15 |
| 10 | Instalar desde `main` en una máquina limpia | Ethan | jue 15 |
| Z | Ensayo de la demo y entrega | Ambos | jue 15 – vie 16 |

## Números

232 pruebas en verde (eran 180 el 6 oct), `tsc`, `eslint` y `next build`
limpios, auditoría 45/45, migraciones reproducen el esquema desde cero.
