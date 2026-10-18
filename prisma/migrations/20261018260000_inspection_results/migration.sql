-- CreateEnum
CREATE TYPE "InspectionRating" AS ENUM ('GREEN', 'YELLOW', 'RED');
-- AlterEnum
ALTER TYPE "Capability" ADD VALUE 'CONDUCT_INSPECTION';
-- CreateTable
CREATE TABLE "InspectionResult" (
    "id" SERIAL NOT NULL,
    "inspectionId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "areaId" INTEGER,
    "employmentId" INTEGER,
    "rating" "InspectionRating" NOT NULL,
    "comment" TEXT,
    "photoPath" TEXT,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InspectionResult_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "InspectionResult_inspectionId_idx" ON "InspectionResult"("inspectionId");
-- AddForeignKey
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RegulationItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
