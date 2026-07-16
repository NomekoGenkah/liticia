-- CreateEnum
CREATE TYPE "IngestaDisparador" AS ENUM ('MANUAL', 'CRON');

-- AlterTable
ALTER TABLE "IngestaRun" ADD COLUMN     "disparadoPor" "IngestaDisparador" NOT NULL DEFAULT 'MANUAL';
