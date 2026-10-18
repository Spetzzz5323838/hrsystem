-- CreateEnum
CREATE TYPE "ViolationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');
-- CreateTable
CREATE TABLE "Violation" (
    "id" SERIAL NOT NULL,
    "inspectionId" INTEGER NOT NULL,
    "resultId" INTEGER NOT NULL,
    "orgNodeId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "target" "RegulationTarget" NOT NULL,
    "areaId" INTEGER,
    "subjectEmploymentId" INTEGER,
    "status" "ViolationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "takenAt" TIMESTAMP(3),
    "takenById" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" INTEGER,
    "ratingEventId" INTEGER,
    CONSTRAINT "Violation_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "Violation_resultId_key" ON "Violation"("resultId");
-- CreateIndex
CREATE INDEX "Violation_orgNodeId_status_idx" ON "Violation"("orgNodeId", "status");
-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "InspectionResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_subjectEmploymentId_fkey" FOREIGN KEY ("subjectEmploymentId") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
