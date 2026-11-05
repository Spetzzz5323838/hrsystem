
-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "summaryNote" TEXT;

-- CreateTable
CREATE TABLE "EventRule" (
    "eventCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minLevel" INTEGER NOT NULL DEFAULT 40,
    "includeAccountants" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EventRule_pkey" PRIMARY KEY ("eventCode")
);

-- CreateTable
CREATE TABLE "EventSubscription" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "eventCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "EventSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" SERIAL NOT NULL,
    "eventCode" TEXT NOT NULL,
    "orgNodeId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventSubscription_personId_eventCode_key" ON "EventSubscription"("personId", "eventCode");

-- CreateIndex
CREATE INDEX "EventLog_dispatchedAt_idx" ON "EventLog"("dispatchedAt");

-- CreateIndex
CREATE INDEX "EventLog_eventCode_createdAt_idx" ON "EventLog"("eventCode", "createdAt");

-- AddForeignKey
ALTER TABLE "EventSubscription" ADD CONSTRAINT "EventSubscription_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Правила за замовчуванням (каталог подій у lib/events.ts)
INSERT INTO "EventRule" ("eventCode", "enabled", "minLevel", "includeAccountants") VALUES
  ('HIRE_REGISTERED', true, 40, true),
  ('HIRE_TRAINEE', true, 40, true),
  ('HIRE_ACTIVE', true, 40, true),
  ('TERMINATION_STARTED', true, 40, true),
  ('TERMINATION_DONE', true, 40, true),
  ('TRANSFER', true, 40, false),
  ('FREEZE', true, 40, false),
  ('INSPECTION_COMPLETED', true, 40, false)
ON CONFLICT ("eventCode") DO NOTHING;

-- Шаблон щоденного зведення
INSERT INTO "NotificationTemplate" ("key", "description", "text", "updatedAt") VALUES
  ('events.digest', 'Щоденне зведення подій за підпискою',
   '🔔 Зведення подій' || chr(10) || chr(10) || '{{lines}}' || chr(10) || chr(10) || 'Налаштувати підписки: /subscriptions', NOW())
ON CONFLICT ("key") DO NOTHING;
