-- AlterTable
ALTER TABLE "ChecklistItemTemplate" ADD COLUMN     "competencyId" INTEGER;

-- AddForeignKey
ALTER TABLE "ChecklistItemTemplate" ADD CONSTRAINT "ChecklistItemTemplate_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: прив'язати вже наявні пункти-тести ONBOARDING_BASE до їхніх
-- компетенцій (seed.ts тут не спрацює повторно — seedOnboardingTemplate
-- виходить раніше, якщо шаблон уже існує).
UPDATE "ChecklistItemTemplate" SET "competencyId" = (SELECT "id" FROM "Competency" WHERE "code" = 'CASHIER_PRRO')
WHERE "title" = 'Тест «Каса»';

UPDATE "ChecklistItemTemplate" SET "competencyId" = (SELECT "id" FROM "Competency" WHERE "code" = 'SANITATION_HACCP')
WHERE "title" = 'Тест «Санітарія»';

UPDATE "ChecklistItemTemplate" SET "competencyId" = (SELECT "id" FROM "Competency" WHERE "code" = 'SERVICE_STANDARDS')
WHERE "title" = 'Тест «Стандарти»';

