-- CreateEnum
CREATE TYPE "EquipmentEventType" AS ENUM ('ASSIGNED', 'CLEARED');

-- CreateTable
CREATE TABLE "EquipmentEvent" (
    "id" SERIAL NOT NULL,
    "equipmentId" INTEGER NOT NULL,
    "type" "EquipmentEventType" NOT NULL,
    "employmentId" INTEGER NOT NULL,
    "performedById" INTEGER NOT NULL,
    "processInstanceId" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentEvent_equipmentId_idx" ON "EquipmentEvent"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentEvent_employmentId_idx" ON "EquipmentEvent"("employmentId");

-- CreateIndex
CREATE INDEX "EquipmentEvent_processInstanceId_idx" ON "EquipmentEvent"("processInstanceId");

-- AddForeignKey
ALTER TABLE "EquipmentEvent" ADD CONSTRAINT "EquipmentEvent_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentEvent" ADD CONSTRAINT "EquipmentEvent_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentEvent" ADD CONSTRAINT "EquipmentEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentEvent" ADD CONSTRAINT "EquipmentEvent_processInstanceId_fkey" FOREIGN KEY ("processInstanceId") REFERENCES "ProcessInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

