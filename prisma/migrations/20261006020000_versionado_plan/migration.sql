-- CreateEnum
CREATE TYPE "TipoExhibicion" AS ENUM ('ANTICIPO', 'MENSUALIDAD', 'ADELANTO', 'LIQUIDACION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoExhibicion" ADD VALUE 'REEMPLAZADA';
ALTER TYPE "EstadoExhibicion" ADD VALUE 'CANCELADA';

-- DropIndex
DROP INDEX "Exhibicion_planId_numero_key";

-- AlterTable
ALTER TABLE "Exhibicion" ADD COLUMN     "tipo" "TipoExhibicion" NOT NULL DEFAULT 'MENSUALIDAD',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- La exhibición 0 de los planes que ya existen es su anticipo.
UPDATE "Exhibicion" SET "tipo" = 'ANTICIPO' WHERE "numero" = 0;

-- CreateTable
CREATE TABLE "VersionPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "saldo" DECIMAL(12,2) NOT NULL,
    "calendario" JSONB NOT NULL,
    "usuario" TEXT NOT NULL DEFAULT 'sistema',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VersionPlan_planId_version_key" ON "VersionPlan"("planId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Exhibicion_planId_version_tipo_numero_key" ON "Exhibicion"("planId", "version", "tipo", "numero");

-- AddForeignKey
ALTER TABLE "VersionPlan" ADD CONSTRAINT "VersionPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

