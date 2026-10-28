-- CreateTable
CREATE TABLE "MaterialProgress" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "requestedAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaterialProgress_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "MaterialProgress_materialId_idx" ON "MaterialProgress"("materialId");
-- CreateIndex
CREATE UNIQUE INDEX "MaterialProgress_personId_materialId_key" ON "MaterialProgress"("personId", "materialId");
-- AddForeignKey
ALTER TABLE "MaterialProgress" ADD CONSTRAINT "MaterialProgress_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "MaterialProgress" ADD CONSTRAINT "MaterialProgress_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Шаблони сповіщень нової функції "Навчання" (на бойовому сервері seed не запускається,
-- тому створюємо тут; якщо шаблон уже є — не чіпаємо).
INSERT INTO "NotificationTemplate" ("key", "description", "text", "updatedAt") VALUES
  ('training.planReady', 'Стажеру на старті онбордингу — план навчання готовий (кнопка відкриває розділ «Навчання»)',
   'Ласкаво просимо! Ваш план навчання готовий. Обов''язкових матеріалів: {{count}}. Відкрийте «📚 Навчання», отримуйте матеріали по одному й відмічайте, коли переглянули.', NOW()),
  ('training.reviewRequest', 'Працівнику — час ознайомитись з обов''язковими матеріалами (крок закривається автоматично)',
   'Потрібно ознайомитись з навчальними матеріалами: переглянуто {{viewed}} з {{total}}. Відкрийте «📚 Навчання», отримайте матеріал і натисніть «Переглянув». Крок закриється автоматично.', NOW()),
  ('training.completed', 'Працівнику — ознайомлення з обов''язковими матеріалами завершено',
   '✅ Ви ознайомились з усіма обов''язковими матеріалами. Дякуємо!', NOW())
ON CONFLICT ("key") DO NOTHING;
