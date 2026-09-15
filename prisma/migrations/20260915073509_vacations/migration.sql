-- CreateEnum
CREATE TYPE "VacationType" AS ENUM ('ANNUAL', 'UNPAID');

-- CreateEnum
CREATE TYPE "VacationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "Capability" ADD VALUE 'APPROVE_VACATION';

-- CreateTable
CREATE TABLE "VacationRequest" (
    "id" SERIAL NOT NULL,
    "employmentId" INTEGER NOT NULL,
    "type" "VacationType" NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "status" "VacationStatus" NOT NULL DEFAULT 'PENDING',
    "isOutOfSchedule" BOOLEAN NOT NULL DEFAULT false,
    "hasConflict" BOOLEAN NOT NULL DEFAULT false,
    "isCriticalPosition" BOOLEAN NOT NULL DEFAULT false,
    "conflictNote" TEXT,
    "requiresEscalation" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "decidedById" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VacationRequest_employmentId_idx" ON "VacationRequest"("employmentId");

-- AddForeignKey
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

