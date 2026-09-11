-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Capability" ADD VALUE 'FREEZE';
ALTER TYPE "Capability" ADD VALUE 'INIT_TRANSFER';
ALTER TYPE "Capability" ADD VALUE 'APPROVE_TRANSFER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmploymentStatus" ADD VALUE 'TRANSFER_PENDING';
ALTER TYPE "EmploymentStatus" ADD VALUE 'FROZEN';

-- AlterEnum
ALTER TYPE "ProcessType" ADD VALUE 'TRANSFER';

-- AlterTable
ALTER TABLE "Employment" ADD COLUMN     "freezeVacatesPosition" BOOLEAN,
ADD COLUMN     "frozenReasonCode" TEXT,
ADD COLUMN     "frozenSince" TIMESTAMP(3),
ADD COLUMN     "plannedReturnAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FreezeReason" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FreezeReason_pkey" PRIMARY KEY ("code")
);

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_frozenReasonCode_fkey" FOREIGN KEY ("frozenReasonCode") REFERENCES "FreezeReason"("code") ON DELETE SET NULL ON UPDATE CASCADE;

