-- CreateEnum
CREATE TYPE "RegulationTarget" AS ENUM ('GENERAL', 'AREA', 'PERSON');
-- CreateEnum
CREATE TYPE "InspectionKind" AS ENUM ('DAILY', 'WEEKLY');
-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.
ALTER TYPE "Capability" ADD VALUE 'MANAGE_REGULATION';
ALTER TYPE "Capability" ADD VALUE 'MANAGE_INSPECTION_SCHEDULE';
-- CreateTable
CREATE TABLE "RegulationVersion" (
    "id" SERIAL NOT NULL,
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RegulationVersion_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "RegulationItem" (
    "id" SERIAL NOT NULL,
    "versionId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "target" "RegulationTarget" NOT NULL,
    "areaTypeId" INTEGER,
    "positionProfileId" INTEGER,
    "inDaily" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "RegulationItem_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "InspectionSchedule" (
    "id" SERIAL NOT NULL,
    "orgNodeId" INTEGER NOT NULL,
    "dailyTime" TEXT,
    "weeklyDay" INTEGER,
    "weeklyTime" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" INTEGER,
    CONSTRAINT "InspectionSchedule_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Inspection" (
    "id" SERIAL NOT NULL,
    "orgNodeId" INTEGER NOT NULL,
    "kind" "InspectionKind" NOT NULL,
    "plannedFor" TIMESTAMP(3) NOT NULL,
    "originalPlannedFor" TIMESTAMP(3) NOT NULL,
    "postponedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "InspectionStatus" NOT NULL DEFAULT 'PLANNED',
    "regulationVersionId" INTEGER,
    "conductedById" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "RegulationVersion_version_key" ON "RegulationVersion"("version");
-- CreateIndex
CREATE INDEX "RegulationItem_versionId_idx" ON "RegulationItem"("versionId");
-- CreateIndex
CREATE UNIQUE INDEX "InspectionSchedule_orgNodeId_key" ON "InspectionSchedule"("orgNodeId");
-- CreateIndex
CREATE INDEX "Inspection_orgNodeId_status_idx" ON "Inspection"("orgNodeId", "status");
-- AddForeignKey
ALTER TABLE "RegulationVersion" ADD CONSTRAINT "RegulationVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "RegulationItem" ADD CONSTRAINT "RegulationItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "RegulationVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "RegulationItem" ADD CONSTRAINT "RegulationItem_areaTypeId_fkey" FOREIGN KEY ("areaTypeId") REFERENCES "AreaType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "RegulationItem" ADD CONSTRAINT "RegulationItem_positionProfileId_fkey" FOREIGN KEY ("positionProfileId") REFERENCES "PositionProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "InspectionSchedule" ADD CONSTRAINT "InspectionSchedule_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "InspectionSchedule" ADD CONSTRAINT "InspectionSchedule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_regulationVersionId_fkey" FOREIGN KEY ("regulationVersionId") REFERENCES "RegulationVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_conductedById_fkey" FOREIGN KEY ("conductedById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
