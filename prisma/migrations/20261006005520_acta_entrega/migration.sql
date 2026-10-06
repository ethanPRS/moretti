-- CreateTable
CREATE TABLE "ActaEntrega" (
    "id" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "archivoNombre" TEXT NOT NULL,
    "fechaFirma" TIMESTAMP(3) NOT NULL,
    "quienFirmo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActaEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActaEntrega_unidadId_key" ON "ActaEntrega"("unidadId");

-- AddForeignKey
ALTER TABLE "ActaEntrega" ADD CONSTRAINT "ActaEntrega_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
