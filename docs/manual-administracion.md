# Manual de administración

Para quien opera el back office de día uno (`/admin`): Moretti, Ana Cris y
el equipo de cobranza. Cada sección dice qué hace la pantalla, cómo se usa y
qué no deja hacer el sistema (y por qué).

## Entrar

`/admin` pide la contraseña del back office. Cinco intentos fallidos
bloquean 15 minutos. La sesión dura 8 horas; «Salir» la cierra en ese
navegador.

## Mapa del back office

| Menú | Para qué |
|---|---|
| **Inicio** | La cartera de un vistazo y la guía para dejar un proyecto listo para vender. |
| **Proyectos** | Proyectos, prototipos, unidades y precios por paquete. |
| **Paquetes** | Nombre, contenido e imagen de cada paquete para el sitio. |
| **Cobranza** | Por proyecto: vendidos, apartados, al corriente, vencidos; cobros del mes y alertas. |
| **Pagos** | Cada cobro con su comisión y referencia. |
| **Pagos a Moretti** | Lo que la plataforma tiene retenido y las transferencias a Moretti. |
| **Fiscal** | Comprobantes fiscales pendientes con su fecha límite. |

## 1. Dejar un proyecto listo para vender

1. **Proyectos › Nuevo**: nombre, % de anticipo, % de comisión del canal y
   mínimo para financiar. Son parámetros: nada de esto está escrito en el
   código.
2. **Prototipos**: cada tipo de departamento, con metros, recámaras y climas
   de fábrica.
3. **Unidades**: torre y número (se pueden dar de alta por rango).
4. **Precios**: un precio por paquete y prototipo, en pesos enteros. Un
   precio nuevo **no borra** el anterior: le cierra la vigencia. Los planes
   que ya existen conservan su precio.

## 2. Un comprador, del alta al anticipo

1. Desde el sitio («Quiero apartarlo») o desde el back office (unidad libre
   › «Dar de alta»): se elige paquete o «Arma el tuyo» y queda una
   **cotización**.
2. **Registrar el contrato firmado.** Sin contrato, el sistema no cobra
   (R1) y el botón de cobro aparece bloqueado.
3. **Cobrar el anticipo.** Al cobrarse, el precio se **congela** con toda su
   lista de partidas (R2) y la unidad pasa a **Apartado**.

## 3. El estado de cuenta de un plan

Abre el plan desde Inicio o Cobranza.

- **Lo que se vendió**: partida por partida. La suma tiene que cuadrar al
  peso con el plan (R7); si no cuadra lo dice en rojo y no deja cobrar.
- **Acabados y fotos**: se eligen y cambian hasta el levantamiento en obra.
  Después quedan fijos (R6).
- **Calendario**: anticipo y mensualidades vigentes. El botón «Cobrar»
  aparece en la siguiente. Un rechazo deja la exhibición pendiente y queda
  en la bitácora; volver a cobrar es seguro (no cobra dos veces).
- **Bitácora**: todo lo que pasó, con fecha. No se edita ni se borra.

### Adelanto, liquidación anticipada o upgrade

Sección «Adelanto, liquidación anticipada o upgrade». Siempre se ve **cómo
queda el plan antes de confirmar**. Cada uno crea una **versión nueva** del
plan; las anteriores se consultan en «Versiones del plan».

| Acción | Qué hace |
|---|---|
| **Adelanto** | Un monto extra hoy. Reduce el **número** de mensualidades, no su monto: paga las siguientes completas y el sobrante se abona a la última. |
| **Liquidación anticipada** | Cobra el saldo completo, **sin descuento**, y cierra el plan. No se ofrece en el sitio. |
| **Upgrade de paquete** | Sube a un paquete mayor: el precio congelado se conserva y se le suma la diferencia; hoy se cobra el % de anticipo de la diferencia y el resto se reparte en las mensualidades que quedan, sin alargar el plan. |

Si el banco rechaza el cargo, el plan **regresa solo** a como estaba (queda
una versión que lo explica). No proceden con el plan cancelado, liquidado,
antes del anticipo ni con otro recálculo esperando confirmación. El upgrade
tampoco con el levantamiento hecho (R6) ni con la unidad suspendida.

### Estado financiero a mano

«Cambiar el estado financiero a mano» sólo ofrece lo que se hace a mano:
**suspender**, **reactivar** y **cancelar** (con motivo, definitivo).
Apartado, al corriente y liquidado llegan solos con los cobros.

### Obra y entrega

Dos tarjetas, **Operativa** e **Instalación**, con el paso actual y el
botón del siguiente. Si falta algo, el sistema dice exactamente qué:

| Para pasar a… | Hace falta |
|---|---|
| Levantamiento hecho | La unidad apartada. **Desde aquí ya no se cambian paquete ni acabados.** |
| Acabados elegidos | Un acabado en cada partida que lo ofrece. |
| En producción | El plan **liquidado**. |
| Programada (instalación) | La pieza producida o en almacén. |
| Entregada | Registrar antes el **acta de entrega firmada** (en la misma sección). |

Con la unidad suspendida o cancelada no avanza ninguna. Los pasos no se
regresan; si se marcó uno por error, avisa a sistemas.

## 4. Cobranza

Arriba, las **alertas**, sin tener que buscarlas: exhibiciones vencidas,
planes suspendidos, cobros rechazados del mes y comprobantes fiscales
vencidos. Cada una lleva al plan. Abajo, por proyecto, cómo va la cartera y
lo cobrado y por cobrar del mes.

## 5. Pagos a Moretti (Ana Cris)

La plataforma cobra y **retiene** el dinero. Aquí se ve, por proyecto, lo
cobrado, la comisión del canal y lo que le toca a Moretti.

1. Escribe tu nombre en «Quién autoriza».
2. «Pagar a Moretti» → confirma el monto.
3. La transferencia queda en el historial con quién la autorizó y su
   referencia. Si la pasarela la rechaza, el dinero sigue retenido; si no
   contesta, vuelve a intentar: **no se paga dos veces**.

Sin la cuenta de Stripe de Moretti configurada en el proyecto no se puede
transferir.

## 6. Fiscal

Cada cobro nace con un **comprobante pendiente** (R8). Fecha límite: el día
5 del mes siguiente al cobro, recorrido al siguiente día hábil si cae en fin
de semana o feriado. La lista está agrupada por fecha límite porque casi todo
vence el mismo día 5. Colores: **rojo**, vencido; **ámbar**, vence en 3 días
o menos. Para cerrarlo, captura el **folio fiscal (UUID)** del CFDI y
«Emitido».

## Lo que el sistema no deja hacer, en una tabla

| Intento | Respuesta |
|---|---|
| Cobrar sin contrato | «falta el contrato firmado…» (R1) |
| Cambiar la lista de partidas después del anticipo | No hay forma: está congelada (R2) |
| Editar o borrar un cobro | No hay forma (R3) |
| Recalcular sobrescribiendo | Siempre crea una versión (R4) |
| Cambiar acabados o paquete después del levantamiento | «…desde ahí no hay cambios (R6)» |
| Un plan que no cuadra al peso | No deja cobrar (R7) |
| Cobrar dos veces lo mismo | Misma llave: un solo cargo |
| Pasar a producción sin liquidar | «Falta: que el plan esté Liquidado…» |
