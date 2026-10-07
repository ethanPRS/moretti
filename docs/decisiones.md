# Bitácora de decisiones

Cada decisión con su fecha, quién la tomó, por qué y qué la haría cambiar.
Nada se borra: si una decisión se revierte, se agrega una nueva que la
sustituye y se marca la vieja como «sustituida por D-xx».

Estados: **Vigente** · **Provisional** (se usa mientras llega la respuesta de
alguien de fuera) · **Por ratificar** (la tomó una persona y falta que la vea
la otra) · **Sustituida**.

> Las decisiones del 27 de septiembre las tomó Claude trabajando a nombre de
> Ethan, con la instrucción de «tomar la que considere mejor» y dejarlas para
> revisión. Todas quedan **por ratificar por Ethan** además de lo que diga
> cada una.

---

## D-01 · Guardar la tarjeta también pasa por la interfaz de la pasarela

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Por ratificar** con Charly (S1-01)
- **Decisión:** `Pasarela` tiene un segundo método, `prepararTarjeta`, además de `cobrar`.
- **Por qué:** la pasarela es el único módulo que importa Stripe. Si el alta
  llamara a Stripe directo para guardar la tarjeta, habría dos lugares que
  saben de Stripe y cambiar a la pasarela real ya no sería «un import». Además
  así el alta se puede probar con la pasarela falsa.
- **Qué la cambiaría:** que la captura de la tarjeta termine siendo 100 % del
  navegador (Checkout alojado por Stripe) sin nada que preparar en el servidor.

## D-02 · Dónde vive la tarjeta: variante provisional

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Provisional** hasta que Ana Cris / abogado decidan (esperado lun 28)
- **Decisión:** mientras no haya respuesta se usa el **plan B de la sección 09
  del plan del sprint**: la tarjeta se guarda en la cuenta de la **plataforma**
  (SetupIntent con `usage: "off_session"`) y al cobrar se **clona** el método
  de pago hacia la cuenta conectada de Moretti para el cargo directo.
- **Por qué:** la spec §3 dice plataforma y la spec §8 («vende su
  departamento») y la hoja 15 dicen cuenta de Moretti: se contradicen. Stripe
  permite clonar de la plataforma hacia una cuenta conectada, no al revés, así
  que empezar en la plataforma deja abiertas las dos puertas.
- **Qué la cambiaría:** la respuesta de Ana Cris. Si dice «Moretti», S1-06
  guarda directo en la cuenta conectada y se deja de clonar; el contrato del
  motor no cambia.

## D-03 · El resultado de un cobro tiene tres estados; montos en centavos

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Por ratificar** con Charly (S1-01)
- **Decisión:** `ResultadoCobro` es `exitoso | pendiente | rechazado` y los
  montos del contrato viajan en centavos enteros. Detalle en `docs/contrato-pasarela.md`.
- **Por qué:** un cobro que pide autenticación reportado como «rechazado»
  quemaría el intento y podría acabar en doble cargo; los montos con
  decimales en JavaScript se convierten mal a centavos.

## D-04 · Precio de lista de la cocina, derivado de Casa Lista

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Provisional** hasta que Moretti dé el precio de lista real de la cocina
- **Decisión:** `cocina = precio(Casa Lista) − lista(clósets) − lista(carpintería)`,
  por prototipo. Se guarda como un `PrecioPartida` más (lo agrega la migración
  del 27 a las bases existentes y el seed a las nuevas; la función es
  `precioCocinaDerivado` en `prisma/catalogo.ts`).
- **Por qué:** la maqueta 5b no trae precio de lista de la cocina porque sólo
  se vende en paquete. Pero la regla «quitar una partida → lo que queda a
  lista» (spec §4) casi siempre deja la cocina en la canasta, y el reparto del
  precio del paquete entre renglones (D-05) necesita su peso. Derivarla de
  Casa Lista es la única opción que sale de datos que ya existen y no
  inventa un número. En los 13 prototipos da positivo y múltiplo de $100.
- **Consecuencia:** Casa Lista cuesta exactamente sus tres partidas a lista, así
  que quitar algo de Casa Lista no cambia el total. En los otros paquetes el
  descuento de conjunto va de $0 a $400 (tabla en `docs/reglas.md`).
- **Qué la cambiaría:** el precio real de Moretti. Cambiarlo es cargar un
  `PrecioPartida` nuevo; no toca código.

## D-05 · Cómo se reparte el precio de un paquete entre sus renglones

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente**
- **Decisión:** en proporción al precio de lista de cada partida (por su
  cantidad), redondeado al peso; la última partida por orden de catálogo
  absorbe el redondeo.
- **Por qué:** S1-02 pide que la suma de los renglones sea el monto congelado,
  al peso (R7). Proporcional a la lista es lo más defendible si algún día se
  cancela o se ajusta una partida sola; absorber en la última es la misma
  regla que ya usa el plan con la exhibición 12. Alternativa descartada: un
  renglón negativo de «descuento de paquete» (rompe «la suma de los renglones
  es el monto congelado» y no es una partida).
- **Se probó que:** en los 52 paquetes cerrados la suma cuadra al peso y ningún
  renglón queda en cero o negativo; la migración en SQL y la función en
  TypeScript dan exactamente los mismos renglones.

## D-06 · Bajar la cantidad de una partida del paquete también es «quitar»

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente**
- **Decisión:** Confort con 2 climas cuando el prototipo trae 3 deja de ser
  paquete. Subir la cantidad (4 climas) es «agregar»: el extra va a lista en
  su propio renglón y el paquete conserva su precio.
- **Por qué:** si bajar la cantidad conservara el precio de conjunto, el
  comprador se quedaría con el subsidio de la partida que quitó — exactamente
  lo que la spec §4 quiere evitar.

## D-07 · La diferencia que se avisa al deshacer un paquete

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente**
- **Decisión:** el aviso dice cuánto más paga el comprador contra «el precio
  del paquete menos lo que quitó, a lista». Esa cantidad es siempre
  `Σ lista(contenido del paquete) − precio del paquete`: el descuento de
  conjunto que pierde.
- **Por qué:** es la comparación que hace el comprador en la cabeza («si le
  quito el clima de $29,100, debería costar $147,100») y la que responde la
  pregunta de S1-03.

## D-08 · «Arma el tuyo» nunca lleva cocina, tampoco en el back office

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente**
- **Decisión:** una canasta desde cero no acepta la cocina, ni en el sitio ni
  en el alta. La cocina a precio de lista sólo aparece cuando se le quita algo
  a un paquete cerrado.
- **Por qué:** S1-04 pide que el alta arme la canasta «con la misma lista del
  cotizador», y el cotizador no tiene cocina (spec §4). La frase de la spec
  «o la agrega a lista» queda cubierta porque cualquier paquete cerrado al que
  se le quite algo cobra la cocina a lista.
- **Pregunta abierta para Ana Cris:** ¿se debe poder vender la cocina suelta a
  lista sin nada más? Hoy no.

## D-09 · Debajo del mínimo no se genera ningún plan

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente**
- **Decisión:** si el total no llega a `Proyecto.minimoPlan`, el alta se
  rechaza con un mensaje que dice cuánto falta y que se paga de contado. No se
  genera un «plan de contado».
- **Por qué:** el criterio de S1-03 es «no se genera plan a 12 meses». El cobro
  de contado (un solo pago, SPEI primero) es otra historia que no está en el
  Sprint 1.

## D-10 · Hasta cuándo se cambian el acabado y las fotos (R6)

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente**
- **Decisión:** mientras el estado operativo de la unidad sea `PENDIENTE`. En
  cuanto pasa a `LEVANTAMIENTO_HECHO` (o cualquiera posterior) quedan fijos.
- **Por qué:** R6. Una canasta sin partidas a la medida no lleva levantamiento;
  para esas, el candado se cierra cuando la unidad avanza a cualquier estado
  operativo posterior (pedido o producción).

## D-11 · Fotos de referencia: qué es «JPG o PNG» y qué es «5 MB»

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente**
- **Decisión:** el tipo se decide por el **contenido** del archivo (firma de
  JPEG o PNG), no por la extensión ni por lo que diga el navegador. 5 MB son
  5 × 1024 × 1024 = 5,242,880 bytes.
- **Por qué:** una extensión se cambia a mano; una foto HEIC de iPhone
  renombrada a `.jpg` no la abre la orden de producción. El mensaje de rechazo
  dice cómo exportarla a JPG.

## D-12 · Las fotos se guardan detrás de una interfaz, en disco local por ahora

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Provisional** hasta elegir proveedor antes de producción
- **Decisión:** `lib/almacenamiento/` con la interfaz `Almacenamiento` y una
  implementación local en la carpeta `almacen/` (fuera de `public/` y del
  repositorio). Las fotos se sirven por `/api/fotos/<id>`, no como archivos
  estáticos.
- **Por qué:** criterio de S1-05. Fuera de `public/` porque son fotos que sube
  un comprador: no deben quedar en una URL adivinable. Cambiar a S3, Vercel
  Blob o Supabase es escribir otra implementación y cambiar un import.

## D-13 · De dónde sale el número de intento

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Por ratificar** con Charly (S1-08)
- **Decisión:** columna `Exhibicion.intentosRechazados`. El intento de un cobro
  es `intentosRechazados + 1`; sube **sólo** cuando la pasarela contesta
  `rechazado`, con una actualización condicionada para que dos rechazos
  simultáneos del mismo intento no lo suban dos veces.
- **Por qué:** la llave tiene que ser determinista: si el servidor se cae
  después de cobrar y antes de guardar, el siguiente clic recalcula la misma
  llave y Stripe devuelve el mismo cargo en vez de hacer otro.
- **Relación con la rama de Charly:** su tabla `IntentoCobro` guarda el ciclo
  del PaymentIntent (útil para el webhook). No choca con esta columna, pero
  su llave `exhibicion_<id>` no lleva intento y se tiene que alinear al
  contrato. Ver `docs/sprint-01/notas-para-charly.md`.

## D-14 · El motor recibe la pasarela como parámetro opcional

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente**
- **Decisión:** `cobrarAnticipo(planId, { pasarela })` y
  `cobrarExhibicion(id, { pasarela })`; si no se pasa, se usa la de
  `lib/pasarela/index.ts`.
- **Por qué:** las pruebas necesitan una pasarela que rechace, y el seed tiene
  que seguir usando la falsa aunque la aplicación ya use Stripe.

## D-15 · No se construye «recotizar» antes del anticipo en este sprint

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente**
- **Decisión:** para cambiar la canasta de un plan que todavía es cotización se
  da de alta de nuevo; no hay función para editarla.
- **Por qué:** no está en los criterios del sprint y tiene una trampa: si ya
  hubo un intento de cobro del anticipo, cambiar el monto con la misma llave
  hace que Stripe rechace la petición (llave con otros parámetros). Hay que
  diseñarlo junto con los reintentos (Sprint 2, P). Queda en el backlog.

## D-16 · El mínimo para financiar vive en `Proyecto.minimoPlan`

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente**
- **Decisión:** columna `minimoPlan DECIMAL(12,2) DEFAULT 50000`, con el mismo
  nombre y tipo que ya trae la rama de Charly, para que al juntar las ramas
  sólo una de las dos migraciones la cree.
- **Por qué:** criterio de S1-03 («se lee de Proyecto, no de una constante»).

## D-17 · Todo el trabajo va en ramas locales, sin push

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente** hasta que Ethan revise
- **Decisión:** el trabajo del Sprint 0 que estaba sin commit quedó en la rama
  `sprint-0/cierre` (4 commits) y lo del Sprint 1 en `sprint-1/ethan`, encima.
  `main` no se tocó. Nada se subió a GitHub.
- **Por qué:** subir y abrir PR es de Ethan: son sus commits y el PR lo revisa
  Charly (definición de terminado).

## D-18 · A mano sólo se suspende, se reactiva o se cancela

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente** (S1-13)
- **Decisión:** `cambiarEstadoFinanciero` sólo hace AL_CORRIENTE ↔ SUSPENDIDO
  y cualquiera → CANCELADO. APARTADO, AL_CORRIENTE (desde APARTADO) y
  LIQUIDADO los provocan los cobros. Cancelar exige motivo y cancela el plan
  abierto para que ya no se le cobre.
- **Por qué:** la spec §7 pide que el sistema rechace las transiciones que
  saltan una regla cruzada: APARTADO requiere contrato firmado **y** anticipo
  cobrado. Marcarlo a mano sería saltarse esa regla.
- **Qué la cambiaría:** la actividad Q (Sprint 2), que suspenderá sola a la
  segunda exhibición vencida.

## D-19 · Un pago ya cobrado nunca se rechaza por el estado

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente** (S1-13)
- **Decisión:** al aplicar un pago, el estado financiero sigue el camino
  permitido (SUSPENDIDO → AL_CORRIENTE → LIQUIDADO, un evento por paso). Si no
  hay camino (la unidad está cancelada), el pago se registra, el estado no se
  mueve y queda una alerta `estado_financiero_inesperado`. Un pago tardío
  tampoco reabre un plan cancelado.
- **Por qué:** cuando llega la confirmación, el dinero ya se cobró (R3: no se
  pierde el rastro de un pago). Rechazarlo por una regla de estados perdería
  el registro de un cobro real.

## D-20 · Las páginas que leen la base se arman en cada visita

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente**
- **Decisión:** `await connection()` al inicio del sitio, la cartera, pagos,
  proyectos y paquetes del back office.
- **Por qué:** con `next build` salían estáticas: en producción el cotizador
  habría mostrado los precios y el mínimo del día de compilar. Es la forma que
  recomienda Next 16 sin `cacheComponents` (`export const dynamic` se quita
  cuando se prenda).

## D-21 · Los precios se capturan en pesos enteros

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Vigente**
- **Decisión:** `/api/precios` rechaza un precio con centavos; el cargador del
  catálogo truena si encuentra uno.
- **Por qué:** los precios de lista se redondean a la centena (spec §4) y el
  cotizador calcula en enteros para dar exactamente lo mismo que el motor.
  Mejor rechazar en la captura que redondear en silencio.

## D-22 · Las mensualidades las cobra un barrido, no Stripe Billing

- **Fecha / quién:** 7 oct · Charly (Claude) · **Vigente**
- **Decisión:** las mensualidades se cobran fuera de sesión con
  `cobrarVencidas` (`lib/motor/barrido.ts`), que dispara un cron por
  `/api/cobranza/barrido` con `CRON_SECRET`. No se usan suscripciones ni
  Smart Retries de Stripe.
- **Por qué:** el plan, sus montos congelados y sus fechas viven en el motor
  (R2, R7); duplicarlos en Stripe Billing haría dos fuentes de verdad. Con el
  barrido, cada cobro pasa por el mismo `cobrarExhibicion` que el botón del
  back office: misma llave de idempotencia, misma bitácora.
- **Cómo no cobra dos veces:** candado por exhibición con una actualización
  condicionada (`bloqueadaHasta`), no toca cobros pendientes
  (`cobroPendienteDesde`) y, en el peor caso, la llave es la misma.

## D-23 · Reintentos: una regla por código de rechazo, la decide el motor

- **Fecha / quién:** 7 oct · Charly (Claude) · **Vigente** (reemplaza la
  primera versión del mismo día, con una espera única para todos)
- **Decisión:** cada código tiene su explicación y su regla
  (`lib/motor/rechazos.ts`): `insufficient_funds` a 3 y 7 días,
  `generic_decline` una vez a 2 días, perdida/robada/retenida marcan la
  **tarjeta** inválida para todo el plan, vencida pide otra. Los códigos que
  la especificación no menciona tienen su propia regla, por ratificar con
  Operación; uno desconocido no se reintenta y pide revisarlo. Si el banco
  manda `advice_code = do_not_try_again`, se respeta. El `reintentar` de la
  pasarela queda informativo (contrato v2.2).
- **Por qué:** Charly quiere saber a qué se debe cada rechazo y por qué se
  reintentó o no; con una espera única todos se veían iguales.

## D-24 · El plan se suspende (no la unidad) por vencidas o por disputa

- **Fecha / quién:** 7 oct · Charly (Claude) · **Vigente**
- **Decisión:** nuevo estado `EstadoPlan.SUSPENDIDO`. El plan se suspende con
  dos vencidas (`COBRANZA_VENCIDAS_SUSPENDEN`) o una disputa abierta, y se
  reactiva solo cuando ya no queda ningún motivo (`lib/motor/suspension.ts`).
  Por vencidas se le sigue cobrando; por disputa, no. El estado financiero de
  la unidad (S1-13) no se toca.
- **Por qué:** decisión de Charly: «congelar» por disputa = suspender, y la
  suspensión es del plan.

## D-25 · Reembolsos, disputas y cargos de más son registros nuevos (R3)

- **Fecha / quién:** 7 oct · Charly (Claude) · **Vigente**
- **Decisión:** tablas `Reembolso`, `Disputa` y `CargoExcedente`. Nada edita
  el `Pago` original; lo único que se le llena después es una referencia
  (`stripeApplicationFeeId`), una vez. `EstadoPago` (REEMBOLSADO, DISPUTADO…)
  queda sin usar. Ningún movimiento mueve el saldo del plan: lo decide una
  persona con la alerta.
- **Por qué:** R3 y «la pasarela manda»: lo que Stripe dice que pasó con el
  dinero queda registrado tal cual, aunque no cuadre, con una alerta.
