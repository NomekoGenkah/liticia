-- CreateEnum
CREATE TYPE "IngestaEstado" AS ENUM ('EN_PROCESO', 'COMPLETADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "Licitacion" (
    "id" TEXT NOT NULL,
    "codigoExterno" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigoEstado" INTEGER NOT NULL,
    "estado" TEXT NOT NULL,
    "descripcion" TEXT,
    "nombreOrganismo" TEXT,
    "codigoOrganismo" TEXT,
    "rutOrganismo" TEXT,
    "regionUnidad" TEXT,
    "comunaUnidad" TEXT,
    "fechaPublicacion" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "fechaAdjudicacion" TIMESTAMP(3),
    "montoEstimado" DECIMAL(18,2),
    "visibilidadMonto" INTEGER,
    "moneda" TEXT,
    "tipo" TEXT,
    "codigoTipo" INTEGER,
    "etapas" INTEGER,
    "estadoEtapas" TEXT,
    "subContratacion" INTEGER,
    "urlActaAdjudicacion" TEXT,
    "urlFichaPublica" TEXT NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "primeraVezVisto" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaActualizacion" TIMESTAMP(3) NOT NULL,
    "fechaDetalleObtenido" TIMESTAMP(3),
    "ultimoEstadoConocido" INTEGER,

    CONSTRAINT "Licitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicitacionItem" (
    "id" TEXT NOT NULL,
    "licitacionId" TEXT NOT NULL,
    "nombreProducto" TEXT NOT NULL,
    "categoriaUnspsc" TEXT,
    "cantidad" INTEGER,
    "unidadMedida" TEXT,

    CONSTRAINT "LicitacionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiRequestCounter" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "contador" INTEGER NOT NULL DEFAULT 0,
    "limiteDiario" INTEGER NOT NULL DEFAULT 10000,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiRequestCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestaRun" (
    "id" TEXT NOT NULL,
    "parametros" JSONB,
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFin" TIMESTAMP(3),
    "totalEncontradas" INTEGER NOT NULL DEFAULT 0,
    "totalNuevas" INTEGER NOT NULL DEFAULT 0,
    "totalActualizadas" INTEGER NOT NULL DEFAULT 0,
    "totalErrores" INTEGER NOT NULL DEFAULT 0,
    "estado" "IngestaEstado" NOT NULL DEFAULT 'EN_PROCESO',
    "detalleError" TEXT,

    CONSTRAINT "IngestaRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Licitacion_codigoExterno_key" ON "Licitacion"("codigoExterno");

-- CreateIndex
CREATE INDEX "Licitacion_codigoEstado_idx" ON "Licitacion"("codigoEstado");

-- CreateIndex
CREATE INDEX "Licitacion_fechaCierre_idx" ON "Licitacion"("fechaCierre");

-- CreateIndex
CREATE INDEX "Licitacion_fechaPublicacion_idx" ON "Licitacion"("fechaPublicacion");

-- CreateIndex
CREATE INDEX "Licitacion_codigoOrganismo_idx" ON "Licitacion"("codigoOrganismo");

-- CreateIndex
CREATE INDEX "LicitacionItem_licitacionId_idx" ON "LicitacionItem"("licitacionId");

-- CreateIndex
CREATE INDEX "LicitacionItem_categoriaUnspsc_idx" ON "LicitacionItem"("categoriaUnspsc");

-- CreateIndex
CREATE UNIQUE INDEX "ApiRequestCounter_fecha_key" ON "ApiRequestCounter"("fecha");

-- AddForeignKey
ALTER TABLE "LicitacionItem" ADD CONSTRAINT "LicitacionItem_licitacionId_fkey" FOREIGN KEY ("licitacionId") REFERENCES "Licitacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
