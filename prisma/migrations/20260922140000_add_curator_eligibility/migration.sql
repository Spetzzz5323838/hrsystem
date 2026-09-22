-- CreateTable
CREATE TABLE "CuratorEligibility" (
    "id" SERIAL NOT NULL,
    "employmentId" INTEGER NOT NULL,
    "positionProfileId" INTEGER NOT NULL,
    "grantedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuratorEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CuratorEligibility_employmentId_positionProfileId_key" ON "CuratorEligibility"("employmentId", "positionProfileId");

-- AddForeignKey
ALTER TABLE "CuratorEligibility" ADD CONSTRAINT "CuratorEligibility_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuratorEligibility" ADD CONSTRAINT "CuratorEligibility_positionProfileId_fkey" FOREIGN KEY ("positionProfileId") REFERENCES "PositionProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuratorEligibility" ADD CONSTRAINT "CuratorEligibility_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

