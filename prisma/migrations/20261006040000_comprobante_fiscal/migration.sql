-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('PENDIENTE', 'EMITIDO');

-- CreateTable
CREATE TABLE "ComprobanteFiscal" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fechaCobro" TIMESTAMP(3) NOT NULL,
    "fechaLimite" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'PENDIENTE',
    "folioFiscal" TEXT,
    "emitidoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComprobanteFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComprobanteFiscal_pagoId_key" ON "ComprobanteFiscal"("pagoId");

-- CreateIndex
CREATE INDEX "ComprobanteFiscal_estado_fechaLimite_idx" ON "ComprobanteFiscal"("estado", "fechaLimite");

-- AddForeignKey
ALTER TABLE "ComprobanteFiscal" ADD CONSTRAINT "ComprobanteFiscal_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

