-- CreateEnum
CREATE TYPE "OrigenReembolso" AS ENUM ('BACK_OFFICE', 'DASHBOARD_MORETTI', 'DISPUTA_PERDIDA');

-- CreateEnum
CREATE TYPE "EstadoDisputa" AS ENUM ('ABIERTA', 'GANADA', 'PERDIDA', 'CERRADA');

-- AlterEnum
ALTER TYPE "EstadoPlan" ADD VALUE 'SUSPENDIDO';

-- AlterTable
ALTER TABLE "Comprador" ADD COLUMN     "tarjetaDescripcion" TEXT,
ADD COLUMN     "tarjetaInvalida" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tarjetaVenceAnio" INTEGER,
ADD COLUMN     "tarjetaVenceMes" INTEGER;

-- AlterTable
ALTER TABLE "Exhibicion" ADD COLUMN     "referenciaPendiente" TEXT,
ADD COLUMN     "ultimoCodigoRechazo" TEXT;

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "stripeApplicationFeeId" TEXT;

-- CreateTable
CREATE TABLE "Reembolso" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "origen" "OrigenReembolso" NOT NULL,
    "referenciaStripe" TEXT NOT NULL,
    "devolvioComision" BOOLEAN,
    "motivo" TEXT,
    "usuario" TEXT NOT NULL DEFAULT 'sistema',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reembolso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disputa" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stripeDisputeId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" "EstadoDisputa" NOT NULL DEFAULT 'ABIERTA',
    "abiertaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaEn" TIMESTAMP(3),

    CONSTRAINT "Disputa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoExcedente" (
    "id" TEXT NOT NULL,
    "exhibicionId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "referenciaStripe" TEXT NOT NULL,
    "montoCentavos" INTEGER,
    "detectadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CargoExcedente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reembolso_referenciaStripe_key" ON "Reembolso"("referenciaStripe");

-- CreateIndex
CREATE INDEX "Reembolso_planId_idx" ON "Reembolso"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "Disputa_stripeDisputeId_key" ON "Disputa"("stripeDisputeId");

-- CreateIndex
CREATE INDEX "Disputa_planId_estado_idx" ON "Disputa"("planId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "CargoExcedente_referenciaStripe_key" ON "CargoExcedente"("referenciaStripe");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_stripeApplicationFeeId_key" ON "Pago"("stripeApplicationFeeId");

-- AddForeignKey
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disputa" ADD CONSTRAINT "Disputa_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disputa" ADD CONSTRAINT "Disputa_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoExcedente" ADD CONSTRAINT "CargoExcedente_exhibicionId_fkey" FOREIGN KEY ("exhibicionId") REFERENCES "Exhibicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoExcedente" ADD CONSTRAINT "CargoExcedente_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

