# Renovación: identidad día uno + reglas de la especificación del 10 de septiembre

Fecha: 2026-09-10

Reemplaza al diseño del 2026-09-09. Entraron dos insumos nuevos de Ana Cris:
la **maqueta del sitio** (`5 - Maqueta del sitio (dia uno)_3.html`) y la
**especificación para programar** (`14 - Especificacion para programar
(para Ethan)_1.docx`), más una referencia visual (`ejemplo.webp`).

## Qué cambió en las reglas

La especificación nueva manda sobre la propuesta original. Corrigió cosas
que ya estaban programadas:

| Antes | Ahora | Origen |
|---|---|---|
| Anticipo 10 % configurable | **30 %** (sigue siendo parámetro del proyecto) | §4 |
| Mensualidad con redondeo hacia abajo | `REDONDEA` (half-up); la exhibición 12 absorbe la diferencia | R7, §4 |
| Estados `Cotizado/Apartado/Pagando/…` | `COTIZADO → APARTADO → AL_CORRIENTE → LIQUIDADO` + `SUSPENDIDO` | §7 |
| Precio congelado al cotizar | **Se congela al cobrar el anticipo**, no antes | R2 |
| Sin contrato en el modelo | Tabla `Contrato`; sin él no se cobra | R1 |
| Sin registro de comisión | `Pago` guarda el % y el monto aplicados | §9 |

Reglas que hoy hace cumplir el prototipo: **R1** (sin contrato firmado no se
cobra), **R2** (el precio se congela con el anticipo), **R7** (la suma cuadra
al peso) y la regla cruzada de que APARTADO exige contrato firmado *y*
anticipo cobrado. Los mensajes de error dicen qué falta, no solo que no se
permite.

Verificación: el motor reproduce el ejemplo de la especificación
($147,300 → anticipo $44,190, once de $8,593, la doceava de $8,587) y el
ejemplo de reparto de la maqueta (DEPA 2R + Confort → mensualidad $10,278,
comisión $1,542, Moretti $8,736). Hay tests en `lib/motor/planes.test.ts`
que corren R7 contra los 32 precios reales del catálogo.

## Qué cambió en el diseño

El sistema visual **no se inventó**: se tomó tal cual del CSS de la maqueta,
porque es la marca real.

- **Color:** fondo cálido `#FAF9F7`, tinta `#23211E`, verde acento `#3F5B4A`
  (al corriente), terracota `#B4643C` (atención), radio 3px.
- **Tipografía:** Fraunces para títulos **y para las cifras de dinero**
  (con numeración tabular), Karla para interfaz, IBM Plex Mono para folios.
- **Aire:** de la referencia `ejemplo.webp` — secciones espaciadas, tarjetas
  blancas, cero cromo innecesario. Los formularios de captura quedaron
  detrás de un desplegable para que la pantalla se lea primero.

**Elemento firma — la cinta de exhibiciones.** El avance del plan se muestra
como 13 marcas (anticipo + 12) en vez de una barra de porcentaje: se ve de un
golpe *cuál* exhibición falló, no solo cuánto se lleva pagado. Es específico
de este negocio, donde son doce cargos discretos y no un continuo.

Se fijó el tema en claro: es una herramienta de operación, no una superficie
pública que deba seguir el tema del sistema.

## Datos de ejemplo

Salen del cotizador de la maqueta: PISSA con Barrio Roble (7 prototipos) y
Barrio Santa Lucía (6), los cuatro paquetes acumulativos (Casa Lista,
Confort, Plus, Total) con sus precios reales, y 8 unidades.

## Un bug encontrado al probar

`new Date("2026-09-10")` se interpreta como medianoche UTC, que en Monterrey
es el día anterior: la fecha de firma del contrato se mostraba un día atrás.
Se ancla al mediodía local en `app/api/contratos/route.ts`.

## Lo que sigue

Nada de esto está construido todavía, en el orden que marca la
especificación (§13): Stripe en modo prueba con cargos directos y
`application_fee_amount`, webhooks idempotentes, rechazos y reintentos por
motivo, recálculo por adelanto/upgrade con versionado, seguimiento partida
por partida, expediente documental, pendientes de comprobante fiscal y el
calendario.
