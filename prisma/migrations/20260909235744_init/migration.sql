-- CreateEnum
CREATE TYPE "EstadoFinanciero" AS ENUM ('Cotizado', 'Apartado', 'Pagando', 'Liquidado', 'Cancelado');

-- CreateEnum
CREATE TYPE "EstadoOperativo" AS ENUM ('PorMedir', 'LevantamientoHecho', 'AcabadosElegidos', 'EnProduccion', 'Producido', 'EnAlmacen');

-- CreateEnum
CREATE TYPE "EstadoInstalacion" AS ENUM ('PorProgramar', 'Programada', 'Instalada', 'Entregada', 'ConIncidencia');

-- CreateEnum
CREATE TYPE "EstadoPlan" AS ENUM ('Activo', 'Liquidado', 'Cancelado');

-- CreateEnum
CREATE TYPE "EstadoExhibicion" AS ENUM ('Pendiente', 'Pagada', 'Vencida');

-- CreateTable
CREATE TABLE "Desarrollador" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "condicionesComerciales" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Desarrollador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proyecto" (
    "id" TEXT NOT NULL,
    "desarrolladorId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "etapaPipeline" TEXT NOT NULL DEFAULT 'Vendiendo',
    "numeroUnidades" INTEGER NOT NULL,
    "porcentajeAnticipo" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "porcentajeComision" DECIMAL(5,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prototipo" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "superficie" DECIMAL(8,2) NOT NULL,
    "recamaras" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prototipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paquete" (
    "id" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "partidas" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Paquete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Precio" (
    "id" TEXT NOT NULL,
    "prototipoId" TEXT NOT NULL,
    "paqueteId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenteHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Precio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unidad" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "torre" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "prototipoId" TEXT NOT NULL,
    "estadoFinanciero" "EstadoFinanciero" NOT NULL DEFAULT 'Cotizado',
    "estadoOperativo" "EstadoOperativo" NOT NULL DEFAULT 'PorMedir',
    "estadoInstalacion" "EstadoInstalacion" NOT NULL DEFAULT 'PorProgramar',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comprador" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "fechaRegistro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comprador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "compradorId" TEXT NOT NULL,
    "paqueteId" TEXT NOT NULL,
    "precioId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "saldo" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoPlan" NOT NULL DEFAULT 'Activo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exhibicion" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fechaProgramada" TIMESTAMP(3) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoExhibicion" NOT NULL DEFAULT 'Pendiente',
    "fechaPagada" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exhibicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "entidadTipo" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "estadoAnterior" TEXT,
    "estadoNuevo" TEXT,
    "comentario" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prototipo_proyectoId_clave_key" ON "Prototipo"("proyectoId", "clave");

-- CreateIndex
CREATE INDEX "Precio_prototipoId_paqueteId_vigenteDesde_idx" ON "Precio"("prototipoId", "paqueteId", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "Unidad_proyectoId_torre_numero_key" ON "Unidad"("proyectoId", "torre", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Comprador_unidadId_key" ON "Comprador"("unidadId");

-- CreateIndex
CREATE UNIQUE INDEX "Exhibicion_planId_numero_key" ON "Exhibicion"("planId", "numero");

-- AddForeignKey
ALTER TABLE "Proyecto" ADD CONSTRAINT "Proyecto_desarrolladorId_fkey" FOREIGN KEY ("desarrolladorId") REFERENCES "Desarrollador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prototipo" ADD CONSTRAINT "Prototipo_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Precio" ADD CONSTRAINT "Precio_prototipoId_fkey" FOREIGN KEY ("prototipoId") REFERENCES "Prototipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Precio" ADD CONSTRAINT "Precio_paqueteId_fkey" FOREIGN KEY ("paqueteId") REFERENCES "Paquete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unidad" ADD CONSTRAINT "Unidad_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unidad" ADD CONSTRAINT "Unidad_prototipoId_fkey" FOREIGN KEY ("prototipoId") REFERENCES "Prototipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprador" ADD CONSTRAINT "Comprador_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_compradorId_fkey" FOREIGN KEY ("compradorId") REFERENCES "Comprador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_paqueteId_fkey" FOREIGN KEY ("paqueteId") REFERENCES "Paquete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_precioId_fkey" FOREIGN KEY ("precioId") REFERENCES "Precio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exhibicion" ADD CONSTRAINT "Exhibicion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
