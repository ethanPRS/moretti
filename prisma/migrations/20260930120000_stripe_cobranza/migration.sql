-- Rebasada sobre sprint-1/ethan: se quitó minimoPlan (ya lo agrega 20260927170210_renglones_plan).
-- Stage A: Stripe payment attempts, connected accounts, and durable webhook events.
-- Generated with prisma migrate diff because the local PostgreSQL user cannot create
-- Prisma's shadow database. Apply with a migration-capable database user.

CREATE TYPE "EstadoPago" AS ENUM ('CONFIRMADO', 'REEMBOLSADO', 'DISPUTADO', 'AJUSTADO');

CREATE TYPE "EstadoIntentoCobro" AS ENUM ('CREADO', 'REQUIERE_ACCION', 'PROCESANDO', 'CONFIRMADO', 'FALLIDO', 'CANCELADO');

ALTER TABLE "Comprador"
  ADD COLUMN "stripeAccountId" TEXT,
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripePaymentMethodId" TEXT;

ALTER TABLE "Pago"
  ADD COLUMN "estado" "EstadoPago" NOT NULL DEFAULT 'CONFIRMADO',
  ADD COLUMN "stripeAccountId" TEXT,
  ADD COLUMN "stripeChargeId" TEXT,
  ADD COLUMN "stripePaymentIntentId" TEXT;

ALTER TABLE "Proyecto"
  ADD COLUMN "stripeConnectedAccountId" TEXT;

CREATE TABLE "IntentoCobro" (
  "id" TEXT NOT NULL,
  "exhibicionId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "stripePaymentIntentId" TEXT,
  "stripeAccountId" TEXT NOT NULL,
  "monto" DECIMAL(12,2) NOT NULL,
  "porcentajeComision" DECIMAL(5,4) NOT NULL,
  "montoComision" DECIMAL(12,2) NOT NULL,
  "estado" "EstadoIntentoCobro" NOT NULL DEFAULT 'CREADO',
  "codigoFallo" TEXT,
  "mensajeFallo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntentoCobro_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventoStripe" (
  "id" TEXT NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "stripeAccountId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "procesado" BOOLEAN NOT NULL DEFAULT false,
  "procesadoEn" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventoStripe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntentoCobro_idempotencyKey_key" ON "IntentoCobro"("idempotencyKey");
CREATE UNIQUE INDEX "IntentoCobro_stripePaymentIntentId_key" ON "IntentoCobro"("stripePaymentIntentId");
CREATE INDEX "IntentoCobro_exhibicionId_estado_idx" ON "IntentoCobro"("exhibicionId", "estado");
CREATE INDEX "IntentoCobro_planId_createdAt_idx" ON "IntentoCobro"("planId", "createdAt");
CREATE UNIQUE INDEX "EventoStripe_stripeEventId_key" ON "EventoStripe"("stripeEventId");
CREATE INDEX "EventoStripe_stripeAccountId_tipo_idx" ON "EventoStripe"("stripeAccountId", "tipo");
CREATE UNIQUE INDEX "Pago_stripePaymentIntentId_key" ON "Pago"("stripePaymentIntentId");

ALTER TABLE "IntentoCobro"
  ADD CONSTRAINT "IntentoCobro_exhibicionId_fkey"
  FOREIGN KEY ("exhibicionId") REFERENCES "Exhibicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IntentoCobro"
  ADD CONSTRAINT "IntentoCobro_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
