-- CreateEnum
CREATE TYPE "NivelComplejidad" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "AnalisisEstado" AS ENUM ('COMPLETADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "LicitacionAnalisis" (
    "id" TEXT NOT NULL,
    "licitacionId" TEXT NOT NULL,
    "resumenEjecutivo" TEXT,
    "puntosClave" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "palabrasClave" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nivelComplejidad" "NivelComplejidad",
    "estado" "AnalisisEstado" NOT NULL,
    "modelo" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 1,
    "duracionMs" INTEGER,
    "detalleError" TEXT,
    "generadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicitacionAnalisis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LicitacionAnalisis_licitacionId_key" ON "LicitacionAnalisis"("licitacionId");

-- CreateIndex
CREATE INDEX "LicitacionAnalisis_estado_idx" ON "LicitacionAnalisis"("estado");

-- AddForeignKey
ALTER TABLE "LicitacionAnalisis" ADD CONSTRAINT "LicitacionAnalisis_licitacionId_fkey" FOREIGN KEY ("licitacionId") REFERENCES "Licitacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
