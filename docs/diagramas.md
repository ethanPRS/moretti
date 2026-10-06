# Diagramas: modelo de datos y máquinas de estado

Actividad X+Y del Sprint 3 (parte de Ethan). Los diagramas están en Mermaid:
GitHub y VS Code los dibujan solos. Fuente de verdad: `prisma/schema.prisma`
y `lib/motor/estados.ts` y `lib/motor/operacion.ts`.

## 1. Modelo de datos

Sólo las columnas que explican el diseño; el esquema completo está en
`prisma/schema.prisma` y el detalle en `modelo-de-datos.md`.

```mermaid
erDiagram
  Desarrollador ||--o{ Proyecto : tiene
  Proyecto ||--o{ Prototipo : tiene
  Proyecto ||--o{ Unidad : tiene
  Prototipo ||--o{ Unidad : "es de"
  Prototipo ||--o{ PrecioPartida : "precio de lista"
  Prototipo ||--o{ Precio : "precio de paquete (versionado)"
  Partida ||--o{ PrecioPartida : ""
  Paquete ||--o{ Precio : ""
  Paquete }o--o{ Partida : contiene
  Unidad ||--o| Comprador : "la compra"
  Unidad ||--o| Contrato : "R1"
  Unidad ||--o| ActaEntrega : "para ENTREGADA"
  Comprador ||--o{ Plan : ""
  Plan }o--|| Paquete : "etiqueta"
  Plan ||--o{ RenglonPlan : "lo vendido (R2, R7)"
  RenglonPlan }o--|| Partida : ""
  RenglonPlan ||--o{ FotoReferencia : "hasta 2"
  Plan ||--o{ Exhibicion : "anticipo + 12"
  Plan ||--o{ VersionPlan : "foto de cada versión (R4)"
  Exhibicion ||--o| Pago : "R3"
  Exhibicion ||--o{ IntentoCobro : "Stripe"
  Pago ||--o| ComprobanteFiscal : "R8"
  TransferenciaMoretti ||--o{ Pago : "D-34"

  Proyecto {
    decimal porcentajeAnticipo
    decimal porcentajeComision
    decimal minimoPlan
    string stripeConnectedAccountId
  }
  Unidad {
    enum estadoFinanciero
    enum estadoOperativo
    enum estadoInstalacion
  }
  Plan {
    enum modalidad "PAQUETE A_LISTA ARMA_EL_TUYO"
    int version
    datetime fechaCongelamiento "R2"
    decimal montoCongelado
    decimal saldo
    enum estado
  }
  RenglonPlan {
    int cantidad
    decimal precioLista
    decimal precioCongelado
    enum origen "PAQUETE AGREGADA"
    string acabado
  }
  Exhibicion {
    int numero
    enum tipo "ANTICIPO MENSUALIDAD ADELANTO LIQUIDACION UPGRADE"
    int version
    decimal monto
    enum estado "PENDIENTE PAGADA VENCIDA REEMPLAZADA CANCELADA"
    int intentosRechazados
  }
  Pago {
    decimal monto
    decimal porcentajeComision
    decimal montoComision
    string referenciaStripe
    enum estado
    string transferenciaId "null = retenido"
  }
  ComprobanteFiscal {
    datetime fechaLimite
    enum estado "PENDIENTE EMITIDO"
    string folioFiscal
  }
  TransferenciaMoretti {
    decimal bruto
    decimal comision
    decimal neto
    enum estado
    string autorizadaPor
  }
```

**Invariantes que el motor verifica** (y sus pruebas):

| Invariante | Dónde |
|---|---|
| Σ `RenglonPlan.precioCongelado` = `Plan.montoCongelado` (R7) | alta, upgrade |
| Σ exhibiciones vigentes = `Plan.montoCongelado` (R7) | alta, cada versión nueva |
| Un `Pago` por exhibición; un pago no se edita ni se borra (R3) | índice único, `aplicarPago` |
| Un `ComprobanteFiscal` por pago, creado en la misma transacción (R8) | `crearPendienteFiscal` |
| Un pago sólo en una transferencia | reserva condicionada en `autorizarTransferencia` |
| La bitácora `Evento` sólo crece | nadie la actualiza ni la borra |

## 2. Máquina financiera de la unidad

Las flechas gruesas las provoca un cobro; las punteadas son manuales desde el
back office (`cambiarEstadoFinanciero`). Cancelar exige motivo y es definitivo.

```mermaid
stateDiagram-v2
  [*] --> COTIZADO
  COTIZADO --> APARTADO: anticipo cobrado + contrato firmado
  APARTADO --> AL_CORRIENTE: primera mensualidad (o adelanto)
  AL_CORRIENTE --> LIQUIDADO: saldo en cero (última exhibición o liquidación)
  AL_CORRIENTE --> SUSPENDIDO: a mano
  SUSPENDIDO --> AL_CORRIENTE: a mano o al pagar
  COTIZADO --> CANCELADO: a mano, con motivo
  APARTADO --> CANCELADO: a mano, con motivo
  AL_CORRIENTE --> CANCELADO: a mano, con motivo
  SUSPENDIDO --> CANCELADO: a mano, con motivo
  LIQUIDADO --> CANCELADO: a mano, con motivo
  CANCELADO --> [*]
```

## 3. Máquinas operativa e instalación, con las reglas cruzadas

Las dos avanzan de un paso en uno y no retroceden. Las notas son las reglas
que las cruzan con la financiera (actividad Q, `lib/motor/operacion.ts`).

```mermaid
stateDiagram-v2
  direction LR
  state "Operativa" as op {
    PENDIENTE --> LEVANTAMIENTO_HECHO
    LEVANTAMIENTO_HECHO --> ACABADOS_ELEGIDOS
    ACABADOS_ELEGIDOS --> EN_PRODUCCION
    EN_PRODUCCION --> PRODUCIDO
    PRODUCIDO --> EN_ALMACEN
  }
  state "Instalación" as ins {
    NO_PROGRAMADA --> PROGRAMADA
    PROGRAMADA --> INSTALADA
    INSTALADA --> ENTREGADA
  }
  note right of LEVANTAMIENTO_HECHO
    Requiere la unidad apartada.
    Desde aquí: sin upgrade, downgrade
    ni cambio de acabados (R6).
  end note
  note right of ACABADOS_ELEGIDOS
    Requiere un acabado en cada
    partida que lo ofrece.
  end note
  note right of EN_PRODUCCION
    Requiere financiero LIQUIDADO.
  end note
  note right of PROGRAMADA
    Requiere la pieza PRODUCIDA
    o EN_ALMACEN.
  end note
  note right of ENTREGADA
    Requiere el acta de entrega firmada.
  end note
```

**Candado financiero:** con la unidad **SUSPENDIDA** o **CANCELADA**, ninguna
de las dos avanza (tampoco retrocede); al reactivarse sigue donde iba.

## 4. Una exhibición

```mermaid
stateDiagram-v2
  [*] --> PENDIENTE
  PENDIENTE --> PAGADA: cobro confirmado (pasarela o webhook)
  PENDIENTE --> PENDIENTE: rechazo (sube intentosRechazados)
  PENDIENTE --> VENCIDA: pasó su fecha (barrido de O)
  VENCIDA --> PAGADA: cobro confirmado
  PENDIENTE --> REEMPLAZADA: recálculo (adelanto, upgrade)
  PENDIENTE --> CANCELADA: liquidación o cobro de recálculo rechazado
  PAGADA --> [*]
```

## 5. Un cobro, de punta a punta

```mermaid
sequenceDiagram
  participant BO as Back office / sitio
  participant M as Motor
  participant P as Pasarela (Stripe)
  participant DB as Base
  BO->>M: cobrarExhibicion(id)
  M->>M: reglas (R1 contrato, vigente, no pagada)
  M->>P: cobrar(llave plan:exh:intento, centavos, comisión)
  alt exitoso
    P-->>M: referencia
    M->>DB: Pago + exhibición PAGADA + saldo + estado (máquina) + comprobante fiscal + evento
  else pendiente (3-D Secure)
    P-->>M: pendiente
    M->>DB: evento; el webhook aplica después
  else rechazado
    P-->>M: código
    M->>DB: intentosRechazados+1 + evento (siguiente intento, llave nueva)
  end
  Note over DB: El dinero queda retenido en la plataforma (D-34)<br/>hasta que Ana Cris autoriza la transferencia a Moretti.
```
