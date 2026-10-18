-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.
ALTER TYPE "Capability" ADD VALUE 'MANAGE_AREA_TYPES';
ALTER TYPE "Capability" ADD VALUE 'MANAGE_AREAS';
-- AlterTable
ALTER TABLE "OrgNode" ADD COLUMN     "openTime" TEXT,
ADD COLUMN     "staffingCheckedOn" DATE;
-- CreateTable
CREATE TABLE "AreaType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "requiresStaff" BOOLEAN NOT NULL DEFAULT false,
    "isGeneral" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AreaType_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Area" (
    "id" SERIAL NOT NULL,
    "orgNodeId" INTEGER NOT NULL,
    "areaTypeId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AreaResponsible" (
    "id" SERIAL NOT NULL,
    "areaId" INTEGER NOT NULL,
    "employmentId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AreaResponsible_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "AreaType_name_key" ON "AreaType"("name");
-- CreateIndex
CREATE UNIQUE INDEX "Area_orgNodeId_areaTypeId_key" ON "Area"("orgNodeId", "areaTypeId");
-- CreateIndex
CREATE UNIQUE INDEX "AreaResponsible_areaId_employmentId_key" ON "AreaResponsible"("areaId", "employmentId");
-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_areaTypeId_fkey" FOREIGN KEY ("areaTypeId") REFERENCES "AreaType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AreaResponsible" ADD CONSTRAINT "AreaResponsible_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AreaResponsible" ADD CONSTRAINT "AreaResponsible_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
