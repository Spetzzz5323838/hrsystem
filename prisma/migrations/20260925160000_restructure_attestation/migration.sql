-- DropForeignKey
ALTER TABLE "AttestationItem" DROP CONSTRAINT "AttestationItem_sectionId_fkey";

-- DropForeignKey
ALTER TABLE "AttestationItemScore" DROP CONSTRAINT "AttestationItemScore_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "AttestationItemScore" DROP CONSTRAINT "AttestationItemScore_itemId_fkey";

-- DropForeignKey
ALTER TABLE "AttestationSection" DROP CONSTRAINT "AttestationSection_templateId_fkey";

-- DropForeignKey
ALTER TABLE "AttestationTemplate" DROP CONSTRAINT "AttestationTemplate_positionProfileId_fkey";

-- AlterTable
ALTER TABLE "AttestationAttempt" DROP COLUMN "maxScore",
DROP COLUMN "passThresholdPercent",
DROP COLUMN "totalScore";

-- AlterTable
ALTER TABLE "PositionCompetency" ADD COLUMN     "isRequired" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "AttestationItem";

-- DropTable
DROP TABLE "AttestationItemScore";

-- DropTable
DROP TABLE "AttestationSection";

-- DropTable
DROP TABLE "AttestationTemplate";

-- CreateTable
CREATE TABLE "AttestationCompetencyScore" (
    "id" SERIAL NOT NULL,
    "attemptId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "AttestationCompetencyScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttestationCompetencyScore_attemptId_idx" ON "AttestationCompetencyScore"("attemptId");

-- CreateIndex
CREATE INDEX "AttestationCompetencyScore_competencyId_idx" ON "AttestationCompetencyScore"("competencyId");

-- AddForeignKey
ALTER TABLE "AttestationCompetencyScore" ADD CONSTRAINT "AttestationCompetencyScore_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AttestationAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttestationCompetencyScore" ADD CONSTRAINT "AttestationCompetencyScore_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

