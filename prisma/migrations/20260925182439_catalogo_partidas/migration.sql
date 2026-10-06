-- CreateEnum
CREATE TYPE "FamiliaPartida" AS ENUM ('A_LA_MEDIDA', 'DE_CATALOGO', 'VALE');

-- AlterTable
ALTER TABLE "Paquete" ADD COLUMN     "esArmable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Prototipo" ADD COLUMN     "climasDefault" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Partida" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "familia" "FamiliaPartida" NOT NULL,
    "armable" BOOLEAN NOT NULL DEFAULT true,
    "porDefecto" BOOLEAN NOT NULL DEFAULT false,
    "porEquipo" BOOLEAN NOT NULL DEFAULT false,
    "llevaPlano" BOOLEAN NOT NULL DEFAULT false,
    "imagen" TEXT,
    "ficha" JSONB NOT NULL,
    "acabados" JSONB,
    "orden" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioPartida" (
    "id" TEXT NOT NULL,
    "prototipoId" TEXT NOT NULL,
    "partidaId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecioPartida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PaqueteToPartida" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PaqueteToPartida_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Partida_clave_key" ON "Partida"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "PrecioPartida_prototipoId_partidaId_key" ON "PrecioPartida"("prototipoId", "partidaId");

-- CreateIndex
CREATE INDEX "_PaqueteToPartida_B_index" ON "_PaqueteToPartida"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Paquete_slug_key" ON "Paquete"("slug");

-- AddForeignKey
ALTER TABLE "PrecioPartida" ADD CONSTRAINT "PrecioPartida_prototipoId_fkey" FOREIGN KEY ("prototipoId") REFERENCES "Prototipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecioPartida" ADD CONSTRAINT "PrecioPartida_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PaqueteToPartida" ADD CONSTRAINT "_PaqueteToPartida_A_fkey" FOREIGN KEY ("A") REFERENCES "Paquete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PaqueteToPartida" ADD CONSTRAINT "_PaqueteToPartida_B_fkey" FOREIGN KEY ("B") REFERENCES "Partida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

