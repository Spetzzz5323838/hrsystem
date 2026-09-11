-- CreateEnum
CREATE TYPE "CompetencySource" AS ENUM ('ATTESTATION', 'TEST', 'EXTERNAL_COURSE', 'MANUAL');

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ALTER COLUMN "phone" SET NOT NULL;

-- CreateTable
CREATE TABLE "PhoneHistory" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3),

    CONSTRAINT "PhoneHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competency" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "validMonths" INTEGER,
    "resetOnBreakMonths" INTEGER,
    "isBonus" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Competency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionCompetency" (
    "positionProfileId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,

    CONSTRAINT "PositionCompetency_pkey" PRIMARY KEY ("positionProfileId","competencyId")
);

-- CreateTable
CREATE TABLE "CompetencyRecord" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "passedAt" TIMESTAMP(3) NOT NULL,
    "score" INTEGER,
    "validUntil" TIMESTAMP(3),
    "source" "CompetencySource" NOT NULL,
    "frozenDays" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompetencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhoneHistory_personId_idx" ON "PhoneHistory"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Competency_code_key" ON "Competency"("code");

-- CreateIndex
CREATE INDEX "CompetencyRecord_personId_idx" ON "CompetencyRecord"("personId");

-- CreateIndex
CREATE INDEX "CompetencyRecord_competencyId_idx" ON "CompetencyRecord"("competencyId");

-- CreateIndex
CREATE UNIQUE INDEX "PositionProfile_title_key" ON "PositionProfile"("title");

-- AddForeignKey
ALTER TABLE "PhoneHistory" ADD CONSTRAINT "PhoneHistory_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionCompetency" ADD CONSTRAINT "PositionCompetency_positionProfileId_fkey" FOREIGN KEY ("positionProfileId") REFERENCES "PositionProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionCompetency" ADD CONSTRAINT "PositionCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyRecord" ADD CONSTRAINT "CompetencyRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyRecord" ADD CONSTRAINT "CompetencyRecord_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

