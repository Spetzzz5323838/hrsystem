-- CreateEnum
CREATE TYPE "ReviewCriterion" AS ENUM ('QUALITY', 'RELIABILITY', 'PACE', 'TEAM', 'CLIENT', 'INITIATIVE');

-- CreateTable
CREATE TABLE "ReviewCriterionWeight" (
    "id" SERIAL NOT NULL,
    "positionProfileId" INTEGER NOT NULL,
    "criterion" "ReviewCriterion" NOT NULL,
    "weight" INTEGER NOT NULL,

    CONSTRAINT "ReviewCriterionWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" SERIAL NOT NULL,
    "employmentId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "weightedScore" DOUBLE PRECISION NOT NULL,
    "conversationConfirmedAt" TIMESTAMP(3),
    "conversationConfirmedById" INTEGER,
    "employeeAcknowledgedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewScore" (
    "id" SERIAL NOT NULL,
    "reviewId" INTEGER NOT NULL,
    "criterion" "ReviewCriterion" NOT NULL,
    "score" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL,

    CONSTRAINT "ReviewScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCriterionWeight_positionProfileId_criterion_key" ON "ReviewCriterionWeight"("positionProfileId", "criterion");

-- CreateIndex
CREATE INDEX "Review_employmentId_idx" ON "Review"("employmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_employmentId_year_quarter_key" ON "Review"("employmentId", "year", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewScore_reviewId_criterion_key" ON "ReviewScore"("reviewId", "criterion");

-- AddForeignKey
ALTER TABLE "ReviewCriterionWeight" ADD CONSTRAINT "ReviewCriterionWeight_positionProfileId_fkey" FOREIGN KEY ("positionProfileId") REFERENCES "PositionProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_conversationConfirmedById_fkey" FOREIGN KEY ("conversationConfirmedById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewScore" ADD CONSTRAINT "ReviewScore_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

