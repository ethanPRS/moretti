# Diseño: Scaffold + Módulo A.1 (Plan de pagos)

Fecha: 2026-09-09
Contexto: primer corte del prototipo académico "Sistema de venta, cobranza y
operación para equipamiento de vivienda" (ver `../../../../6 - Propuesta de
proyecto (para Ethan y su clase).docx` y `10 - Estructura de tecnologia.docx`
en la raíz del repositorio del negocio, un directorio arriba de este
prototipo).

## Alcance de este corte

Lo primero que la propuesta pide que funcione: contratar un paquete genera
el calendario de pagos (anticipo + 12 mensualidades) con el precio
congelado, y el comprador puede consultar su estado de cuenta.

Explícitamente fuera de este corte (siguientes sprints, siguiendo el
calendario de la propuesta): A.2 cobro recurrente con Stripe, A.3 pagos
adelantados/recálculo, A.4 reparto Stripe Connect, A.5 conciliación,
Módulo B (máquinas de estado con validación de transiciones cruzadas),
Módulo C (pipeline de proyectos).

## Arquitectura

- Next.js 16 (App Router, TypeScript), full-stack en un solo proyecto:
  Route Handlers bajo `app/api/*` para el motor, páginas React para las
  pantallas de back office.
- PostgreSQL local (instalado vía Homebrew en esta máquina; en cualquier
  otro entorno basta con una `DATABASE_URL` de Postgres) + Prisma como ORM
  y migrador.
- Sin autenticación en este corte — pantallas abiertas de administración.
  Los roles (administrador/proveedor/comprador) se agregan cuando se
  construya control de acceso más adelante.

## Modelo de datos

Sigue el modelo preliminar de la propuesta (sección 9), multiproyecto desde
la primera tabla — ver `prisma/schema.prisma`:

`Desarrollador`, `Proyecto` (con `porcentajeAnticipo` y `porcentajeComision`
configurables por proyecto), `Prototipo`, `Paquete`, `Precio` (versionado,
nunca se sobreescribe — una fila nueva cierra la vigencia de la anterior),
`Unidad` (con los tres estados de los tres procesos, sin lógica de
transición todavía — eso es Módulo B), `Comprador`, `Plan` (con el
`precioId` congelado), `Exhibición`, `Evento` (bitácora).

## Regla de negocio: cálculo del anticipo

La propuesta no fija el porcentaje de anticipo. Decisión tomada con el
cliente/usuario: **porcentaje configurable por proyecto, default 10%**. El
resto (90%) se divide entre las 12 mensualidades en partes iguales, con el
ajuste de redondeo aplicado en la mensualidad 12. Ver
`lib/motor/generarPlan.ts`.

## Motor (`lib/motor/generarPlan.ts`)

`generarPlan({ compradorId, paqueteId })`:
1. Verifica que el comprador no tenga ya un plan activo.
2. Busca el `Precio` vigente para el prototipo (vía la unidad del
   comprador) y el paquete elegido. Si no existe, error explícito.
3. Congela ese `precioId` en el `Plan` nuevo.
4. Calcula anticipo y 12 mensualidades con `Decimal` (decimal.js vía
   Prisma) para evitar errores de punto flotante con dinero.
5. Crea plan + 13 exhibiciones + un evento de bitácora, todo en una
   transacción de Prisma.

`marcarExhibicionPagada(exhibicionId)`: simulación manual (sin pasarela)
para poder demostrar "qué pagó, qué debe, qué sigue" en este corte. Marca
la exhibición como pagada, descuenta el saldo del plan, liquida el plan si
el saldo llega a cero, y registra un evento. El cobro automático real
contra Stripe en modo prueba es A.2, el siguiente corte.

## Pantallas

- `/proyectos` — listar/crear desarrollador + proyecto.
- `/proyectos/[id]` — prototipos, paquetes y precios de ese proyecto; alta
  de unidades.
- `/paquetes` — catálogo global de paquetes acumulativos.
- `/compradores/nuevo?unidadId=…` — registrar comprador y elegir paquete →
  genera el plan de inmediato.
- `/planes/[id]` — estado de cuenta: tabla de exhibiciones con fecha,
  monto, estado, y el botón manual "Marcar como pagada".

## Datos de ejemplo

`prisma/seed.ts` (`npm run db:seed`) crea un desarrollador, un proyecto,
dos prototipos, los cuatro paquetes acumulativos, sus precios y cuatro
unidades — para poder probar el flujo sin capturar todo a mano.

## Verificación realizada

- `npx tsc --noEmit` sin errores.
- `npx eslint .` sin errores.
- Flujo end-to-end probado por API (`curl`) y en el navegador
  (chrome-devtools): registrar comprador → plan generado con anticipo
  10% + 12 mensualidades iguales cuadrando contra el precio congelado →
  marcar una mensualidad como pagada → saldo y estado se actualizan
  correctamente.

## Nota de contraste visual

El scaffold de `create-next-app` trae CSS de tema oscuro por
`prefers-color-scheme` fuera de cualquier `@layer`, lo que le gana a las
clases de Tailwind (que sí están en `@layer`) sin importar la
especificidad. Se fijó el tema en claro en `app/globals.css` porque esto es
una herramienta interna de back office, no una superficie pública que deba
adaptarse al tema del sistema.
