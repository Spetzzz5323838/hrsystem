-- CreateEnum
CREATE TYPE "ScanAction" AS ENUM ('ARRIVAL', 'DEPARTURE');

-- CreateEnum
CREATE TYPE "ShiftCloseKind" AS ENUM ('TERMINAL', 'MANUAL', 'AUTO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Capability" ADD VALUE 'OPERATE_TERMINAL';
ALTER TYPE "Capability" ADD VALUE 'MANAGE_TERMINALS';

-- CreateTable
CREATE TABLE "Terminal" (
    "id" SERIAL NOT NULL,
    "orgNodeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "registeredById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Terminal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkShift" (
    "id" SERIAL NOT NULL,
    "employmentId" INTEGER NOT NULL,
    "orgNodeId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "startTerminalId" INTEGER,
    "endTerminalId" INTEGER,
    "closeKind" "ShiftCloseKind",

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" SERIAL NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "employmentId" INTEGER NOT NULL,
    "terminalId" INTEGER NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "action" "ScanAction" NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shiftId" INTEGER NOT NULL,

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Terminal_tokenHash_key" ON "Terminal"("tokenHash");

-- CreateIndex
CREATE INDEX "Terminal_orgNodeId_idx" ON "Terminal"("orgNodeId");

-- CreateIndex
CREATE INDEX "WorkShift_employmentId_endedAt_idx" ON "WorkShift"("employmentId", "endedAt");

-- CreateIndex
CREATE INDEX "WorkShift_orgNodeId_startedAt_idx" ON "WorkShift"("orgNodeId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScanEvent_clientEventId_key" ON "ScanEvent"("clientEventId");

-- CreateIndex
CREATE INDEX "ScanEvent_employmentId_scannedAt_idx" ON "ScanEvent"("employmentId", "scannedAt");

-- AddForeignKey
ALTER TABLE "Terminal" ADD CONSTRAINT "Terminal_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Terminal" ADD CONSTRAINT "Terminal_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_startTerminalId_fkey" FOREIGN KEY ("startTerminalId") REFERENCES "Terminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_endTerminalId_fkey" FOREIGN KEY ("endTerminalId") REFERENCES "Terminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
