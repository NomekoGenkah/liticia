-- CreateEnum
CREATE TYPE "TipoPerfil" AS ENUM ('EMPRESA', 'PERSONA_NATURAL');

-- AlterTable
ALTER TABLE "PerfilEmpresa" ADD COLUMN     "tipo" "TipoPerfil" NOT NULL DEFAULT 'EMPRESA';
