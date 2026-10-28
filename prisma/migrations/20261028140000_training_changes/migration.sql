-- CreateTable
CREATE TABLE "TrainingChange" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "materialId" INTEGER,
    "competencyId" INTEGER,
    "positionProfileId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    CONSTRAINT "TrainingChange_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "TrainingChange_notifiedAt_idx" ON "TrainingChange"("notifiedAt");

INSERT INTO "NotificationTemplate" ("key", "description", "text", "updatedAt") VALUES
  ('training.planUpdated', 'Працівнику — у його плані навчання з''явилось нове (матеріал чи компетенція)',
   '📚 У вашому плані навчання є нове:' || chr(10) || '{{list}}' || chr(10) || chr(10) || 'Відкрийте «Навчання», щоб отримати матеріали.', NOW())
ON CONFLICT ("key") DO NOTHING;
