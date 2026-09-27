-- AlterTable
ALTER TABLE "RenglonPlan" ADD COLUMN     "acabado" TEXT;

-- CreateTable
CREATE TABLE "FotoReferencia" (
    "id" TEXT NOT NULL,
    "renglonId" TEXT NOT NULL,
    "posicion" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FotoReferencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FotoReferencia_clave_key" ON "FotoReferencia"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "FotoReferencia_renglonId_posicion_key" ON "FotoReferencia"("renglonId", "posicion");

-- AddForeignKey
ALTER TABLE "FotoReferencia" ADD CONSTRAINT "FotoReferencia_renglonId_fkey" FOREIGN KEY ("renglonId") REFERENCES "RenglonPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Escrito a mano (Prisma no genera CHECK): máximo dos fotos por partida
-- también en la base, no sólo en el código (S1-05). Con el índice único de
-- (renglonId, posicion), una tercera foto no cabe aunque lleguen dos subidas
-- al mismo tiempo; y lo que no sea JPG o PNG no entra aunque alguien se
-- salte el motor.
ALTER TABLE "FotoReferencia"
  ADD CONSTRAINT "FotoReferencia_posicion_check" CHECK ("posicion" IN (1, 2)),
  ADD CONSTRAINT "FotoReferencia_tipo_check" CHECK ("tipo" IN ('image/jpeg', 'image/png')),
  ADD CONSTRAINT "FotoReferencia_bytes_check" CHECK ("bytes" > 0 AND "bytes" <= 5242880);
