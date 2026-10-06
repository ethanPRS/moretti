-- CreateEnum
CREATE TYPE "EstadoTransferencia" AS ENUM ('EN_PROCESO', 'ENVIADA', 'FALLIDA');

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "transferenciaId" TEXT;

-- CreateTable
CREATE TABLE "TransferenciaMoretti" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "bruto" DECIMAL(12,2) NOT NULL,
    "comision" DECIMAL(12,2) NOT NULL,
    "neto" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoTransferencia" NOT NULL DEFAULT 'EN_PROCESO',
    "autorizadaPor" TEXT NOT NULL,
    "referencia" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferenciaMoretti_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransferenciaMoretti_proyectoId_estado_idx" ON "TransferenciaMoretti"("proyectoId", "estado");

-- CreateIndex
CREATE INDEX "Pago_transferenciaId_idx" ON "Pago"("transferenciaId");

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "TransferenciaMoretti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

