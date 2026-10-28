-- CreateEnum
CREATE TYPE "TimesheetCorrectionKind" AS ENUM ('EDIT', 'CREATE', 'CANCEL', 'AUTO_CLOSE');
-- CreateEnum
CREATE TYPE "TimesheetCorrectionReason" AS ENUM ('FORGOT_ARRIVAL', 'FORGOT_DEPARTURE', 'TERMINAL_FAILURE', 'MARKED_BY_MISTAKE', 'OFF_TERMINAL_WORK', 'OTHER', 'AUTO_CLOSE');
-- AlterTable
ALTER TABLE "WorkShift" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" INTEGER;
-- CreateTable
CREATE TABLE "TimesheetCorrection" (
    "id" SERIAL NOT NULL,
    "kind" "TimesheetCorrectionKind" NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "employmentId" INTEGER NOT NULL,
    "orgNodeId" INTEGER NOT NULL,
    "reason" "TimesheetCorrectionReason" NOT NULL,
    "comment" TEXT,
    "beforeStartedAt" TIMESTAMP(3),
    "beforeEndedAt" TIMESTAMP(3),
    "afterStartedAt" TIMESTAMP(3),
    "afterEndedAt" TIMESTAMP(3),
    "beforeMinutes" INTEGER,
    "afterMinutes" INTEGER,
    "deltaMinutes" INTEGER NOT NULL DEFAULT 0,
    "actorId" INTEGER,
    "periodClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimesheetCorrection_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "TimesheetCorrection_employmentId_createdAt_idx" ON "TimesheetCorrection"("employmentId", "createdAt");
-- CreateIndex
CREATE INDEX "TimesheetCorrection_orgNodeId_createdAt_idx" ON "TimesheetCorrection"("orgNodeId", "createdAt");
-- CreateIndex
CREATE INDEX "TimesheetCorrection_shiftId_idx" ON "TimesheetCorrection"("shiftId");
-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TimesheetCorrection" ADD CONSTRAINT "TimesheetCorrection_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TimesheetCorrection" ADD CONSTRAINT "TimesheetCorrection_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TimesheetCorrection" ADD CONSTRAINT "TimesheetCorrection_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TimesheetCorrection" ADD CONSTRAINT "TimesheetCorrection_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Перенесення наявних правок табеля з загального журналу дій у новий журнал правок.
-- Причину старих записів невідомо за списком, тому "Інше" + текст причини як коментар.
INSERT INTO "TimesheetCorrection" ("kind", "shiftId", "employmentId", "orgNodeId", "reason", "comment",
  "beforeStartedAt", "beforeEndedAt", "afterStartedAt", "afterEndedAt", "beforeMinutes", "afterMinutes", "deltaMinutes", "actorId", "createdAt")
SELECT
  CASE x.action WHEN 'shift.created' THEN 'CREATE'::"TimesheetCorrectionKind"
                WHEN 'shift.autoClosed' THEN 'AUTO_CLOSE'::"TimesheetCorrectionKind"
                ELSE 'EDIT'::"TimesheetCorrectionKind" END,
  x."shiftId", x."employmentId", x."orgNodeId",
  CASE WHEN x.action = 'shift.autoClosed' THEN 'AUTO_CLOSE'::"TimesheetCorrectionReason" ELSE 'OTHER'::"TimesheetCorrectionReason" END,
  x.reason_text,
  x.bs, x.be, x.as_, x.ae,
  x.bm, x.am, (x.am - x.bm), x."actorId", x."createdAt"
FROM (
  SELECT a.action, a."actorId", a."createdAt", s."id" AS "shiftId", s."employmentId", s."orgNodeId",
    a.diff->>'reason' AS reason_text,
    CASE a.action WHEN 'shift.edited' THEN (a.diff->'before'->>'startedAt')::timestamptz AT TIME ZONE 'UTC'
                  WHEN 'shift.autoClosed' THEN (a.diff->>'startedAt')::timestamptz AT TIME ZONE 'UTC' END AS bs,
    CASE a.action WHEN 'shift.edited' THEN (a.diff->'before'->>'endedAt')::timestamptz AT TIME ZONE 'UTC' END AS be,
    CASE a.action WHEN 'shift.edited' THEN (a.diff->'after'->>'startedAt')::timestamptz AT TIME ZONE 'UTC'
                  WHEN 'shift.created' THEN (a.diff->>'startedAt')::timestamptz AT TIME ZONE 'UTC'
                  WHEN 'shift.autoClosed' THEN (a.diff->>'startedAt')::timestamptz AT TIME ZONE 'UTC' END AS as_,
    CASE a.action WHEN 'shift.edited' THEN (a.diff->'after'->>'endedAt')::timestamptz AT TIME ZONE 'UTC'
                  WHEN 'shift.created' THEN (a.diff->>'endedAt')::timestamptz AT TIME ZONE 'UTC'
                  WHEN 'shift.autoClosed' THEN ((a.diff->>'startedAt')::timestamptz AT TIME ZONE 'UTC') + ((a.diff->>'assignedHours')::int * INTERVAL '1 hour') END AS ae
  FROM "AuditLog" a
  JOIN "WorkShift" s ON s."id" = a."entityId"
  WHERE a."entityType" = 'WorkShift' AND a.action IN ('shift.edited', 'shift.created', 'shift.autoClosed') AND a.diff IS NOT NULL
) x0
CROSS JOIN LATERAL (
  SELECT x0.*,
    CASE WHEN x0.bs IS NOT NULL AND x0.be IS NOT NULL THEN ROUND(EXTRACT(EPOCH FROM (x0.be - x0.bs)) / 60)::int ELSE 0 END AS bm,
    CASE WHEN x0.as_ IS NOT NULL AND x0.ae IS NOT NULL THEN ROUND(EXTRACT(EPOCH FROM (x0.ae - x0.as_)) / 60)::int ELSE 0 END AS am
) x
ORDER BY x."createdAt";

-- Шаблон повідомлення працівнику про виправлення його табеля.
INSERT INTO "NotificationTemplate" ("key", "description", "text", "updatedAt") VALUES
  ('timesheet.corrected', 'Працівнику — його робочий час за зміну виправлено, додано чи скасовано (з причиною)',
   'Ваш табель за {{date}} виправлено.' || chr(10) || '{{details}}' || chr(10) || 'Причина: {{reason}}', NOW())
ON CONFLICT ("key") DO NOTHING;
