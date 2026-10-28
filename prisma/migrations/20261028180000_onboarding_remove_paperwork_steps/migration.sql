-- 2026-10-28: з чек-ліста онбордингу прибрано пункти «Оформлення прийому (заява, наказ)» і
-- «Договір про матвідповідальність» — усе оформлення закриває «Прийом і сканування документів».
-- Дані, а не схема: бойовий сервер не запускає seed, тож нову версію шаблону створюємо тут.
-- Міграція ідемпотентна: якщо в чинній версії цих пунктів уже немає, нічого не робить.

-- 1. Перехід у «стажера» для тих, хто вже пройшов «Прийом і сканування документів», а тепер прибираний
--    крок «Оформлення прийому» ще чекав виконання: інакше вони застрягли б у DOCUMENTS_PENDING.
WITH stuck AS (
  SELECT DISTINCT pi."employmentId"
  FROM "ProcessInstance" pi
  JOIN "Task" tp ON tp."instanceId" = pi."id" AND tp."status" = 'PENDING'
  JOIN "ChecklistItemTemplate" ip ON ip."id" = tp."itemTemplateId" AND ip."title" = 'Оформлення прийому (заява, наказ)'
  JOIN "Task" td ON td."instanceId" = pi."id" AND td."status" = 'DONE'
  JOIN "ChecklistItemTemplate" idone ON idone."id" = td."itemTemplateId" AND idone."title" = 'Прийом і сканування документів'
  WHERE pi."state" = 'RUNNING'
), moved AS (
  UPDATE "Employment" e SET "status" = 'TRAINEE'
  FROM stuck
  WHERE e."id" = stuck."employmentId" AND e."status" = 'DOCUMENTS_PENDING'
  RETURNING e."id"
)
INSERT INTO "AuditLog" ("actorId", "action", "entityType", "entityId", "diff", "createdAt")
SELECT NULL, 'onboarding.traineeStarted', 'Employment', moved."id", '{"reason":"крок оформлення прибрано з чек-ліста"}'::jsonb, NOW() FROM moved;

-- 2. Відкриті задачі прибраних пунктів у запущених процесах видаляємо (вони більше не потрібні).
DELETE FROM "Task" t
USING "ProcessInstance" pi, "ChecklistItemTemplate" i
WHERE t."instanceId" = pi."id" AND pi."state" = 'RUNNING' AND t."status" = 'PENDING'
  AND i."id" = t."itemTemplateId"
  AND i."title" IN ('Оформлення прийому (заява, наказ)', 'Договір про матвідповідальність');

-- 3. Нова версія шаблону без цих пунктів (старі процеси лишаються на своїй версії).
DO $$
DECLARE
  t_old "ProcessTemplate"%ROWTYPE;
  t_new_id INTEGER;
BEGIN
  SELECT * INTO t_old FROM "ProcessTemplate" WHERE "code" = 'ONBOARDING_BASE' ORDER BY "version" DESC LIMIT 1;
  IF t_old."id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "ChecklistItemTemplate"
    WHERE "templateId" = t_old."id" AND "title" IN ('Оформлення прийому (заява, наказ)', 'Договір про матвідповідальність')
  ) THEN
    UPDATE "ProcessTemplate" SET "isActive" = false WHERE "id" = t_old."id";
    INSERT INTO "ProcessTemplate" ("code", "version", "type", "name", "isActive")
    VALUES (t_old."code", t_old."version" + 1, t_old."type", t_old."name", true)
    RETURNING "id" INTO t_new_id;
    INSERT INTO "ChecklistItemTemplate" ("templateId", "order", "title", "responsibleRole", "actionType", "isBlocking", "slaHours", "module", "competencyId")
    SELECT t_new_id, "order", "title", "responsibleRole", "actionType", "isBlocking", "slaHours", "module", "competencyId"
    FROM "ChecklistItemTemplate"
    WHERE "templateId" = t_old."id" AND "title" NOT IN ('Оформлення прийому (заява, наказ)', 'Договір про матвідповідальність');
  END IF;
END $$;
