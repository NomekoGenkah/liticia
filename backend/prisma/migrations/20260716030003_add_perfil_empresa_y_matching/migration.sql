-- CreateEnum
CREATE TYPE "RecomendacionMatching" AS ENUM ('SI', 'NO', 'TAL_VEZ');

-- CreateEnum
CREATE TYPE "MatchingEstado" AS ENUM ('COMPLETADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "PerfilEmpresa" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "rubro" TEXT,
    "palabrasClave" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categoriasUnspsc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regionesInteres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "montoMinimo" DECIMAL(18,2),
    "montoMaximo" DECIMAL(18,2),
    "version" INTEGER NOT NULL DEFAULT 1,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerfilEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicitacionMatching" (
    "id" TEXT NOT NULL,
    "licitacionId" TEXT NOT NULL,
    "puntaje" INTEGER,
    "recomendacion" "RecomendacionMatching",
    "justificacion" TEXT,
    "estado" "MatchingEstado" NOT NULL,
    "modelo" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL,
    "perfilVersion" INTEGER NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 1,
    "duracionMs" INTEGER,
    "detalleError" TEXT,
    "generadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicitacionMatching_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LicitacionMatching_licitacionId_key" ON "LicitacionMatching"("licitacionId");

-- CreateIndex
CREATE INDEX "LicitacionMatching_estado_idx" ON "LicitacionMatching"("estado");

-- CreateIndex
CREATE INDEX "LicitacionMatching_recomendacion_idx" ON "LicitacionMatching"("recomendacion");

-- AddForeignKey
ALTER TABLE "LicitacionMatching" ADD CONSTRAINT "LicitacionMatching_licitacionId_fkey" FOREIGN KEY ("licitacionId") REFERENCES "Licitacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
