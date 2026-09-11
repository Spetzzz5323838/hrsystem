-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'PRINT';

-- AlterTable
ALTER TABLE "Employment" ADD COLUMN     "lastWorkingDay" TIMESTAMP(3),
ADD COLUMN     "terminationReasonCode" TEXT;

-- CreateTable
CREATE TABLE "TerminationReason" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TerminationReason_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ClearanceSheet" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "employmentId" INTEGER NOT NULL,
    "instanceId" INTEGER NOT NULL,
    "generatedById" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isComplete" BOOLEAN NOT NULL,
    "pdfPath" TEXT,
    "hash" TEXT NOT NULL,

    CONSTRAINT "ClearanceSheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClearanceSheet_number_key" ON "ClearanceSheet"("number");

-- CreateIndex
CREATE INDEX "ClearanceSheet_employmentId_idx" ON "ClearanceSheet"("employmentId");

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_terminationReasonCode_fkey" FOREIGN KEY ("terminationReasonCode") REFERENCES "TerminationReason"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceSheet" ADD CONSTRAINT "ClearanceSheet_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

