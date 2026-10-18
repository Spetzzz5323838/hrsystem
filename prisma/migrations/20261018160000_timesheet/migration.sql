-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Capability" ADD VALUE 'VIEW_TIMESHEET';
ALTER TYPE "Capability" ADD VALUE 'EDIT_SHIFTS';

-- AlterTable
ALTER TABLE "WorkShift" ADD COLUMN     "editReason" TEXT,
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedById" INTEGER;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
