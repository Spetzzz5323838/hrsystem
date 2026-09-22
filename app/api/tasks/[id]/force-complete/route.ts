import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { logAudit } from "../../../../../lib/audit";
import { completeTask } from "../../../../../lib/onboarding";
import { completeTransferTask } from "../../../../../lib/transfer";
import { completeTerminationTask } from "../../../../../lib/termination";
import { Capability, EmploymentStatus, ProcessType } from "../../../../../generated/prisma/client";

/**
 * Примусове завершення пункту чек-листа сисадміном (правки 20.09.2026,
 * п.9) — щоб процес не зависав, якщо призначений виконавець фізично
 * недоступний (напр. втратив доступ до Telegram). На відміну від
 * /api/tasks/[id]/complete, тут НЕ перевіряється "чи моя ця задача" —
 * лише можливість FORCE_COMPLETE_TASK. Блокування попереднім пунктом
 * усе одно перевіряється (той самий completeTask/completeTransferTask/
 * completeTerminationTask) — force обходить тільки перевірку виконавця,
 * не порядок чек-листа. Для "Призначення куратора"/"Реєстрація в 1С" (які
 * потребують реальних вхідних даних — куратора чи пароля) force тут не
 * підтримується: їх треба виконати звичайним шляхом або вручну через базу.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      itemTemplate: true,
      instance: { include: { template: true, employment: { include: { staffUnit: { include: { orgNode: true } } } } } },
    },
  });
  if (!task) return NextResponse.json({ error: "Задачу не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.FORCE_COMPLETE_TASK, {
    personId: task.instance.employment.personId,
    orgNodePath: task.instance.employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права на примусове завершення" }, { status: 403 });

  if (task.itemTemplate.title === "Призначення куратора" || task.itemTemplate.title === "Реєстрація в 1С, генерація пароля") {
    return NextResponse.json({ error: "Цей пункт потребує реальних даних (куратора чи пароля) — примусове завершення недоступне" }, { status: 400 });
  }

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  let result;
  if (task.instance.template.type === ProcessType.TRANSFER) {
    result = await completeTransferTask(taskId, actor.id);
  } else if (task.instance.template.type === ProcessType.OFFBOARDING) {
    result = await completeTerminationTask(taskId, actor.id);
  } else {
    result = await completeTask(taskId, actor.id);
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  await logAudit({
    actorId: actor.id,
    action: "task.forceCompleted",
    entityType: "Task",
    entityId: taskId,
    diff: { taskTitle: task.itemTemplate.title, instanceId: task.instanceId },
  });

  return NextResponse.json({ ok: true });
}
