-- CreateEnum
CREATE TYPE "ProcesoTipo" AS ENUM ('ANALISIS', 'MATCHING', 'EMBEDDING');

-- CreateEnum
CREATE TYPE "ProcesoDisparador" AS ENUM ('MANUAL', 'CLI');

-- CreateEnum
CREATE TYPE "ProcesoRunEstado" AS ENUM ('EN_PROCESO', 'COMPLETADO', 'FALLIDO', 'CANCELADO', 'INTERRUMPIDO');

-- CreateEnum
CREATE TYPE "ProcesoItemEstado" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'FALLIDO', 'OMITIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "ProcesoRun" (
    "id" TEXT NOT NULL,
    "tipo" "ProcesoTipo" NOT NULL,
    "disparadoPor" "ProcesoDisparador" NOT NULL DEFAULT 'MANUAL',
    "parametros" JSONB NOT NULL,
    "modelo" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFin" TIMESTAMP(3),
    "totalEncontradas" INTEGER NOT NULL DEFAULT 0,
    "totalCompletadas" INTEGER NOT NULL DEFAULT 0,
    "totalFallidas" INTEGER NOT NULL DEFAULT 0,
    "totalOmitidos" INTEGER NOT NULL DEFAULT 0,
    "estado" "ProcesoRunEstado" NOT NULL DEFAULT 'EN_PROCESO',
    "detalleError" TEXT,

    CONSTRAINT "ProcesoRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcesoRunItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "objetoId" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "titulo" TEXT,
    "subtitulo" TEXT,
    "orden" INTEGER NOT NULL,
    "estado" "ProcesoItemEstado" NOT NULL DEFAULT 'PENDIENTE',
    "duracionMs" INTEGER,
    "detalleError" TEXT,
    "fechaInicio" TIMESTAMP(3),
    "fechaFin" TIMESTAMP(3),

    CONSTRAINT "ProcesoRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcesoRun_tipo_fechaInicio_idx" ON "ProcesoRun"("tipo", "fechaInicio");

-- CreateIndex
CREATE INDEX "ProcesoRun_tipo_estado_idx" ON "ProcesoRun"("tipo", "estado");

-- CreateIndex
CREATE INDEX "ProcesoRunItem_runId_estado_idx" ON "ProcesoRunItem"("runId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ProcesoRunItem_runId_orden_key" ON "ProcesoRunItem"("runId", "orden");

-- AddForeignKey
ALTER TABLE "ProcesoRunItem" ADD CONSTRAINT "ProcesoRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProcesoRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
