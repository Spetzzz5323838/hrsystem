-- CreateEnum
CREATE TYPE "ProcessType" AS ENUM ('ONBOARDING', 'OFFBOARDING', 'EXTRA_TRAINING');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('MARK', 'UPLOAD', 'INPUT_VALUE', 'TEST', 'APPROVAL', 'AUTO');

-- CreateEnum
CREATE TYPE "ProcessState" AS ENUM ('RUNNING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'DONE');

-- CreateEnum
CREATE TYPE "ChecklistModule" AS ENUM ('CASHIER', 'MVO', 'FOOD', 'RETAIL', 'WAREHOUSE', 'TRANSPORT', 'SECURITY', 'MANAGEMENT', 'OFFICE');

-- AlterTable
ALTER TABLE "PositionProfile" ADD COLUMN     "moduleFlags" "ChecklistModule"[] DEFAULT ARRAY[]::"ChecklistModule"[];

-- CreateTable
CREATE TABLE "ProcessTemplate" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "type" "ProcessType" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProcessTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItemTemplate" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "responsibleRole" "Role",
    "actionType" "ActionType" NOT NULL,
    "isBlocking" BOOLEAN NOT NULL DEFAULT true,
    "slaHours" INTEGER,
    "module" "ChecklistModule",

    CONSTRAINT "ChecklistItemTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessInstance" (
    "id" SERIAL NOT NULL,
    "employmentId" INTEGER NOT NULL,
    "templateId" INTEGER NOT NULL,
    "state" "ProcessState" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ProcessInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "instanceId" INTEGER NOT NULL,
    "itemTemplateId" INTEGER NOT NULL,
    "assigneeId" INTEGER,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "comment" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" INTEGER,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessTemplate_code_version_key" ON "ProcessTemplate"("code", "version");

-- CreateIndex
CREATE INDEX "ChecklistItemTemplate_templateId_idx" ON "ChecklistItemTemplate"("templateId");

-- CreateIndex
CREATE INDEX "ProcessInstance_employmentId_idx" ON "ProcessInstance"("employmentId");

-- CreateIndex
CREATE INDEX "Task_instanceId_idx" ON "Task"("instanceId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- AddForeignKey
ALTER TABLE "ChecklistItemTemplate" ADD CONSTRAINT "ChecklistItemTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProcessTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessInstance" ADD CONSTRAINT "ProcessInstance_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessInstance" ADD CONSTRAINT "ProcessInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProcessTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ProcessInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ChecklistItemTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

