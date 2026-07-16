-- CreateEnum
CREATE TYPE "EstadoExtraccion" AS ENUM ('PENDIENTE', 'COMPLETADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "LicitacionDocumento" (
    "id" TEXT NOT NULL,
    "licitacionId" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamañoBytes" INTEGER NOT NULL,
    "rutaAlmacenamiento" TEXT NOT NULL,
    "textoExtraido" TEXT,
    "estadoExtraccion" "EstadoExtraccion" NOT NULL DEFAULT 'PENDIENTE',
    "detalleError" TEXT,
    "fechaCarga" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicitacionDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LicitacionDocumento_licitacionId_idx" ON "LicitacionDocumento"("licitacionId");

-- CreateIndex
CREATE INDEX "LicitacionDocumento_estadoExtraccion_idx" ON "LicitacionDocumento"("estadoExtraccion");

-- AddForeignKey
ALTER TABLE "LicitacionDocumento" ADD CONSTRAINT "LicitacionDocumento_licitacionId_fkey" FOREIGN KEY ("licitacionId") REFERENCES "Licitacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
