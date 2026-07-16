-- Añadido a mano: Prisma emite el tipo `vector(768)` verbatim pero no sabe que necesita la
-- extensión. El servicio postgres debe correr ya con pgvector/pgvector:pg16-trixie ANTES de
-- aplicar esta migración; contra postgres:16 este statement falla y deja la migración marcada
-- como fallida en _prisma_migrations (se recupera con `prisma migrate resolve --rolled-back`).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "LicitacionDocumentoChunk" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "licitacionId" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "embedding" vector(768) NOT NULL,
    "modelo" TEXT NOT NULL,
    "generadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicitacionDocumentoChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicitacionPregunta" (
    "id" TEXT NOT NULL,
    "licitacionId" TEXT NOT NULL,
    "pregunta" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "fuentes" JSONB NOT NULL,
    "modelo" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL,
    "duracionMs" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicitacionPregunta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LicitacionDocumentoChunk_licitacionId_idx" ON "LicitacionDocumentoChunk"("licitacionId");

-- CreateIndex
CREATE UNIQUE INDEX "LicitacionDocumentoChunk_documentoId_chunkIndex_key" ON "LicitacionDocumentoChunk"("documentoId", "chunkIndex");

-- CreateIndex
CREATE INDEX "LicitacionPregunta_licitacionId_idx" ON "LicitacionPregunta"("licitacionId");

-- AddForeignKey
ALTER TABLE "LicitacionDocumentoChunk" ADD CONSTRAINT "LicitacionDocumentoChunk_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "LicitacionDocumento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicitacionDocumentoChunk" ADD CONSTRAINT "LicitacionDocumentoChunk_licitacionId_fkey" FOREIGN KEY ("licitacionId") REFERENCES "Licitacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicitacionPregunta" ADD CONSTRAINT "LicitacionPregunta_licitacionId_fkey" FOREIGN KEY ("licitacionId") REFERENCES "Licitacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
