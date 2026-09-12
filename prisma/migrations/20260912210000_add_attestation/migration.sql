-- CreateTable
CREATE TABLE "AttestationTemplate" (
    "id" SERIAL NOT NULL,
    "positionProfileId" INTEGER NOT NULL,
    "passThresholdPercent" INTEGER NOT NULL,

    CONSTRAINT "AttestationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttestationSection" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "AttestationSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttestationItem" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "maxPoints" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "AttestationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttestationAttempt" (
    "id" SERIAL NOT NULL,
    "employmentId" INTEGER NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "passThresholdPercent" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "gradedById" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttestationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttestationItemScore" (
    "id" SERIAL NOT NULL,
    "attemptId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "AttestationItemScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttestationTemplate_positionProfileId_key" ON "AttestationTemplate"("positionProfileId");

-- CreateIndex
CREATE INDEX "AttestationSection_templateId_idx" ON "AttestationSection"("templateId");

-- CreateIndex
CREATE INDEX "AttestationItem_sectionId_idx" ON "AttestationItem"("sectionId");

-- CreateIndex
CREATE INDEX "AttestationAttempt_employmentId_idx" ON "AttestationAttempt"("employmentId");

-- CreateIndex
CREATE INDEX "AttestationItemScore_attemptId_idx" ON "AttestationItemScore"("attemptId");

-- AddForeignKey
ALTER TABLE "AttestationTemplate" ADD CONSTRAINT "AttestationTemplate_positionProfileId_fkey" FOREIGN KEY ("positionProfileId") REFERENCES "PositionProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttestationSection" ADD CONSTRAINT "AttestationSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AttestationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttestationItem" ADD CONSTRAINT "AttestationItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "AttestationSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttestationAttempt" ADD CONSTRAINT "AttestationAttempt_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttestationAttempt" ADD CONSTRAINT "AttestationAttempt_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttestationItemScore" ADD CONSTRAINT "AttestationItemScore_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AttestationAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttestationItemScore" ADD CONSTRAINT "AttestationItemScore_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AttestationItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

