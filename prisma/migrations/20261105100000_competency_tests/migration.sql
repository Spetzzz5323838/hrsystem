-- CreateTable
CREATE TABLE "CompetencyTest" (
    "id" SERIAL NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "questionsPerAttempt" INTEGER,
    "passPercent" INTEGER NOT NULL DEFAULT 80,
    "excellentPercent" INTEGER NOT NULL DEFAULT 90,
    "pauseMinutes" INTEGER NOT NULL DEFAULT 60,
    "notifyAfterFails" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompetencyTest_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "TestQuestion" (
    "id" SERIAL NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "replacesId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TestQuestion_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "TestAttempt" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "questions" JSONB NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "correctCount" INTEGER,
    "percent" INTEGER,
    "score" INTEGER,
    "passed" BOOLEAN,
    "abandoned" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TestAttempt_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "TestAnswer" (
    "id" SERIAL NOT NULL,
    "attemptId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "chosenIndex" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestAnswer_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "CompetencyTest_competencyId_key" ON "CompetencyTest"("competencyId");
-- CreateIndex
CREATE INDEX "TestQuestion_competencyId_isActive_idx" ON "TestQuestion"("competencyId", "isActive");
-- CreateIndex
CREATE INDEX "TestAttempt_personId_competencyId_idx" ON "TestAttempt"("personId", "competencyId");
-- CreateIndex
CREATE UNIQUE INDEX "TestAnswer_attemptId_position_key" ON "TestAnswer"("attemptId", "position");
-- AddForeignKey
ALTER TABLE "CompetencyTest" ADD CONSTRAINT "CompetencyTest_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TestQuestion" ADD CONSTRAINT "TestQuestion_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TestAnswer" ADD CONSTRAINT "TestAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TestAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TestAnswer" ADD CONSTRAINT "TestAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "TestQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Шаблони сповіщень для тестів компетенцій (на бойовому сервері seed не запускається).
INSERT INTO "NotificationTemplate" ("key", "description", "text", "updatedAt") VALUES
  ('test.stepAvailable', 'Працівнику — настав пункт онбордингу «тест»: кнопка запускає тест у боті',
   'Потрібно пройти тест «{{name}}». Це займе кілька хвилин, результат запишеться автоматично.', NOW()),
  ('test.notReady', 'Працівнику — тест для компетенції ще не підготовлено',
   'Тест «{{name}}» ще не підготовлено. Зверніться до адміністратора.', NOW()),
  ('test.failedRepeatedly', 'Адміністратору — працівник кілька разів поспіль не склав тест',
   '{{fullName}} не склав(ла) тест «{{name}}» {{count}} разів поспіль (останній результат: {{percent}}%). Варто поговорити з працівником і за потреби повторити навчання.', NOW())
ON CONFLICT ("key") DO NOTHING;
