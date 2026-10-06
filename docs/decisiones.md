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

- **Fecha / quién:** 27 sep · Ethan (Claude) · **Sustituida por D-32** (5 oct)
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

---

> Las decisiones D-22 a D-31 las tomó Claude el 5 de octubre trabajando a
> nombre de Ethan en el Sprint 2 (Q, R y S), con la instrucción de avanzar
> sus tareas hasta terminarlas. Quedan **por ratificar por Ethan**; las que
> tocan código de Charly, también por él.

## D-22 · Las máquinas operativa e instalación sólo avanzan, de un paso en uno

- **Fecha / quién:** 5 oct · Ethan (Claude) · **Por ratificar** (Q)
- **Decisión:** no hay retroceso ni saltos. Requisitos además de los de la
  spec: el levantamiento requiere la unidad apartada; ACABADOS_ELEGIDOS
  requiere un acabado en cada partida que lo ofrece; PROGRAMADA requiere la
  pieza PRODUCIDA o EN_ALMACEN.
- **Por qué:** la spec da las reglas cruzadas pero no el orden. Sin estos
  requisitos se podría programar la instalación de algo que no existe, o
  confirmar acabados con partidas sin elegir. El acabado se elige antes del
  levantamiento (S1-05) y queda fijo después (R6), así que
  ACABADOS_ELEGIDOS es la confirmación de lo elegido, no la elección.
- **Qué la cambiaría:** que operación de Moretti necesite corregir un paso
  marcado por error. Hoy se corrige en la base; un «deshacer» con motivo y
  evento sería una historia aparte.

## D-23 · Con el financiero suspendido o cancelado, tampoco avanza la instalación

- **Fecha / quién:** 5 oct · Ethan (Claude) · **Por ratificar** (Q)
- **Decisión:** el candado de SUSPENDIDO se aplica a las dos máquinas, no
  sólo a la operativa.
- **Por qué:** la spec lo dice de la operativa; instalar en una unidad que
  dejó de pagar es el mismo riesgo.

## D-24 · El estado financiero por pago pasa por la máquina en los dos caminos

- **Fecha / quién:** 5 oct · Ethan (Claude) · **Por ratificar con Charly** (Q)
- **Decisión:** `confirmarCobroStripe` (webhook) ya no escribe el estado
  directo: usa el mismo `moverEstadoPorPago` que la pasarela. Si llega un
  anticipo sin contrato, el pago queda (D-19) pero la unidad no se aparta y
  queda una alerta. Tampoco reabre un plan cancelado.
- **Por qué:** «APARTADO requiere contrato Y anticipo» tiene que valer por
  cualquier camino; el del webhook se lo saltaba y no dejaba evento por paso.

## D-25 · El versionado guarda la foto del calendario y marca, no borra

- **Fecha / quién:** 5 oct · Ethan (Claude) · **Por ratificar** (R)
- **Decisión:** cada exhibición lleva `version` y `tipo`. Un recálculo marca
  lo sustituido como REEMPLAZADA (CANCELADA en la liquidación), crea las
  nuevas con la versión siguiente y guarda en `VersionPlan` la foto completa
  del calendario con su motivo. Las cobradas no cambian de versión.
- **Por qué:** «la versión anterior sigue consultable» sin reconstruirla con
  consultas; y R3 (lo cobrado no se edita) se cumple sin copiar pagos.
- **Qué la cambiaría:** volumen. Una foto JSON por versión es poco para 63
  planes.

## D-26 · El adelanto toma el lugar de la primera exhibición que cubre

- **Fecha / quién:** 5 oct · Ethan (Claude) · **Vigente** (R)
- **Decisión:** el adelanto es una exhibición nueva (tipo ADELANTO) con el
  número de la primera que paga, fechada hoy, y se cobra por el camino
  normal (llave, comisión, bitácora, comprobante fiscal). El índice único es
  `(plan, versión, tipo, número)`.
- **Por qué:** un `Pago` es de una exhibición; un solo cargo por el adelanto
  es más claro para el comprador y para Stripe que N cargos.

## D-27 · Si el sobrante cubre la última, pasa a la penúltima

- **Fecha / quién:** 5 oct · Ethan (Claude) · **Por ratificar** (R)
- **Decisión:** «el sobrante menor a una exhibición se abona a la última»; si
  la última es más chica que el sobrante (absorbe el redondeo), se cubre
  completa y el resto se abona a la anterior.
- **Por qué:** la regla no dice qué hacer en ese caso y una exhibición en
  negativo rompe R7.

## D-28 · Un adelanto o liquidación rechazado se revierte con otra versión

- **Fecha / quién:** 5 oct · Ethan (Claude) · **Por ratificar** (R)
- **Decisión:** si el banco rechaza el cargo, se crea la versión siguiente
  que restituye el calendario anterior; la rechazada queda como historia.
  Si la pasarela no contesta (no se sabe si cobró), NO se revierte: el
  adelanto queda pendiente y se reintenta con la misma llave.
- **Por qué:** el comprador no debe un adelanto que no pagó; dejarlo
  pendiente lo marcaría atrasado. Revertir sin saber si cobró sería peor.
- **Riesgo aceptado:** una confirmación tardía de un cargo ya revertido se
  registra como `Pago` AJUSTADO sin tocar el saldo, con alerta para revisión.

## D-29 · Adelanto y liquidación sólo desde el back office

- **Fecha / quién:** 5 oct · Ethan (Claude) · **Vigente** (R)
- **Decisión:** no hay botón en el sitio del comprador. La liquidación no se
  promociona (lo pide la tarea R) y el adelanto lo opera Moretti a petición.
- **Qué la cambiaría:** el portal del comprador (fuera de alcance).

## D-30 · Fecha límite fiscal en días de México y feriados de la LFT

- **Fecha / quién:** 5 oct · Ethan (Claude) · **Provisional** hasta que lo
  confirme el contador de Moretti (S)
- **Decisión:** el mes del cobro se cuenta en `America/Mexico_City`; «hábil»
  excluye sábados, domingos y los descansos de la LFT art. 74. Los feriados
  extra del SAT (Jueves y Viernes Santo, por ejemplo) se agregan en
  `FERIADOS_FISCALES`. La fecha se guarda a mediodía UTC.
- **Por qué:** un cobro del 31 a las 11 p. m. es de ese mes para el comprador
  y el SAT; en UTC ya sería del siguiente.

## D-31 · El pendiente fiscal nace en la misma transacción que el pago

- **Fecha / quién:** 5 oct · Ethan (Claude) · **Por ratificar con Charly** (S)
- **Decisión:** `crearPendienteFiscal` se llama dentro de `aplicarPago` y de
  `confirmarCobroStripe`, también para un pago AJUSTADO. Uno por pago.
- **Por qué:** R8, «todo cobro nace sin comprobante»: si se creara después,
  una caída en medio dejaría un cobro sin pendiente y nadie lo vería.

## D-32 · La tarjeta vive en la plataforma y se clona a Moretti en cada cobro

- **Fecha / quién:** 5 oct · Ethan (decidido con Claude) · **Sustituida por
  D-33** en la forma del cargo (la tarjeta sigue en la plataforma). Sustituye a D-02.
- **Decisión:** el `Customer` y el método de pago del comprador se guardan
  en la cuenta de la **plataforma** (día uno), con un SetupIntent
  `usage: "off_session"` y 3-D Secure al guardarla. En cada cobro se
  **clona** el método de pago hacia la cuenta conectada de Moretti del
  proyecto y se hace el cargo directo con la comisión del canal.
- **Por qué:**
  - En los dos lugares los datos de la tarjeta viven en Stripe (PCI DSS
    nivel 1); el sistema sólo guarda `cus_…` y `pm_…`. La diferencia está
    en **quién puede cobrarle**: en la plataforma, sólo el sistema, con sus
    reglas, su llave de idempotencia y su bitácora. En la cuenta de
    Moretti, cualquiera con acceso a su panel podría hacer un cargo fuera
    del plan.
  - Si se compromete o se cierra la cuenta de Moretti, las tarjetas no
    están ahí: cada cobro usa una copia hecha para ese cargo.
  - Un solo lugar para retirar una tarjeta, atender el aviso de tarjeta
    por vencer y `payment_method.automatically_updated` (P), y para más
    desarrolladores después.
  - Stripe clona de la plataforma hacia la cuenta conectada, no al revés:
    empezar en la plataforma deja abierta la otra opción.
- **Lo que no cambia:** con cargo directo, Moretti es el comercio que
  cobra: aparece en el estado de cuenta y le llegan las disputas. El texto
  de consentimiento al guardar la tarjeta nombra a día uno y a Moretti y
  dice que se usará para cobrar las mensualidades sin el comprador presente.
- **Prácticas que acompañan la decisión:** sólo el Payment Element de
  Stripe; llaves en `.env`, una llave restringida en producción; firma de
  cada webhook verificada y eventos deduplicados (`EventoStripe`); llave de
  idempotencia con número de intento (M); panel de Stripe de Moretti con
  pocas personas, doble factor y roles.
- **Qué la cambiaría:** que el abogado diga que el comercio que cobra debe
  ser la plataforma (cargo de destino en lugar de cargo directo). La tarjeta
  seguiría en la plataforma; cambiaría la forma del cargo.

## D-33 · Cobra la plataforma y le transfiere a Moretti (cargo de destino)

- **Fecha / quién:** 5 oct · Ethan, con la respuesta de Ana Cris ·
  **Sustituida por D-34** en la transferencia (sigue vigente que cobra la
  plataforma y la tarjeta vive ahí). Cierra I-9. Sustituye a D-32 en la forma del cargo.
- **Lo que dijo Ana Cris:** el comercio que cobra es la plataforma, y de ahí
  se le pasa el dinero a Moretti.
- **Decisión:** **cargo de destino** de Stripe Connect. El PaymentIntent se
  crea en la cuenta de la **plataforma**, con
  `transfer_data.destination = Proyecto.stripeConnectedAccountId` y
  `application_fee_amount` = la comisión del canal. Stripe transfiere a
  Moretti el monto menos la comisión en el mismo movimiento. Sin
  `on_behalf_of`, que volvería a poner a Moretti como el comercio.
- **Qué cambia respecto a D-32:**
  - La tarjeta sigue en la plataforma, pero **ya no se clona**: el cargo se
    hace ahí mismo. Es más simple y Moretti nunca tiene una copia.
  - En el estado de cuenta del comprador aparece **día uno** y las disputas
    y contracargos le llegan a **la plataforma**, que responde por ellos.
  - Los eventos llegan a la cuenta de la plataforma, no como eventos de
    Connect: el webhook ya no recibe `event.account`.
  - En un reembolso, `reverse_transfer` le quita el dinero a Moretti y
    `refund_application_fee` decide si se devuelve la comisión. Es justo la
    casilla que pide la tarea de reembolso del Sprint 3.
- **Por qué cargo de destino y no cargos y transferencias separados:** con
  cargo de destino la transferencia es automática, la comisión queda
  separada en el mismo cargo (el objetivo del Sprint 1) y no hay que
  conciliar transferencias a mano. Separados sólo conviene si la plataforma
  tiene que **retener** el dinero de Moretti hasta un evento (por ejemplo,
  la entrega); está en las preguntas abiertas.
- **Preguntas abiertas** (I-10, I-11): si la plataforma retiene el dinero o
  lo transfiere al cobrar; quién emite el CFDI al comprador ahora que cobra
  la plataforma.

## D-34 · La plataforma retiene el dinero hasta que Ana Cris decide pagar a Moretti

- **Fecha / quién:** 5 oct · Ethan, con la respuesta de Ana Cris a I-10 ·
  **Vigente**. Sustituye a D-33 en la transferencia.
- **Decisión:** **cargos y transferencias separados** de Stripe Connect. El
  cobro se hace en la plataforma **sin** `transfer_data` ni
  `application_fee_amount`: todo el dinero queda en el saldo de la
  plataforma. Cuando Ana Cris decide pagarle a Moretti, se crea una
  `Transfer` a la cuenta conectada por el monto cobrado **menos la comisión
  del canal**, ligada a los cargos que cubre (`source_transaction` o
  `transfer_group` por proyecto).
- **Por qué no cargo de destino:** el cargo de destino transfiere en el mismo
  momento del cobro; Ana Cris quiere decidir cuándo.
- **Lo que implica:**
  - La comisión ya no es una «application fee» de Stripe: es lo que la
    plataforma **no** transfiere. Se sigue guardando en cada `Pago`
    (`montoComision`), y la transferencia es Σ(monto − comisión).
  - Hay que llevar en el sistema qué pagos ya se transfirieron y cuáles
    siguen retenidos, y quién autorizó cada transferencia.
  - Un reembolso de un pago todavía retenido no toca a Moretti; uno ya
    transferido necesita revertir la transferencia (`reversals`).
  - Riesgo financiero: el dinero de Moretti está en el saldo de la
    plataforma. Hay que conciliar saldo de Stripe contra lo retenido.
- **Reparto:** el registro de lo retenido, la pantalla para que Ana Cris
  autorice y el motor son de Ethan; la `Transfer` real en Stripe y su
  webhook (`transfer.created`, `transfer.reversed`) son de Charly.
