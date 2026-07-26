-- CreateEnum
CREATE TYPE "ProveedorIA" AS ENUM ('OLLAMA', 'CLOUD');

-- CreateTable
CREATE TABLE "ConfiguracionIA" (
    "id" TEXT NOT NULL,
    "proveedor" "ProveedorIA" NOT NULL DEFAULT 'OLLAMA',
    "modeloChat" TEXT,
    "vramBudgetMb" INTEGER,
    "ramBudgetMb" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfiguracionIA_pkey" PRIMARY KEY ("id")
);
