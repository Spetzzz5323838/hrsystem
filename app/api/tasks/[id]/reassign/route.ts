import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { logAudit } from "../../../../../lib/audit";
import { Capability, EmploymentStatus, TaskStatus } from "../../../../../generated/prisma/client";

/**
 * Передача незавершеної задачі іншому виконавцю. Потрібна, коли система
 * призначила виконавцем не ту людину (або виконавець недоступний). Той самий
 * гейт, що й примусове завершення: FORCE_COMPLETE_TASK на працівника процесу.
 */
async function loadTask(taskId: number) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: { itemTemplate: true, instance: { include: { employment: { include: { person: true, staffUnit: { include: { orgNode: true } } } } } } },
  });
}

async function requireAccess(taskId: number) {
  const session = await getSessionPerson();
  if (!session) return { error: NextResponse.json({ error: "Не залогований" }, { status: 401 }) };
  if (!Number.isInteger(taskId)) return { error: NextResponse.json({ error: "Невірний id" }, { status: 400 }) };

  const task = await loadTask(taskId);
  if (!task) return { error: NextResponse.json({ error: "Задачу не знайдено" }, { status: 404 }) };

  const allowed = await can(session.id, Capability.FORCE_COMPLETE_TASK, {
    personId: task.instance.employment.personId,
    orgNodePath: task.instance.employment.staffUnit.orgNode.path,
  });
  if (!allowed) return { error: NextResponse.json({ error: "Немає права передавати задачі" }, { status: 403 }) };
  return { session, task };
}

/** Кого можна обрати новим виконавцем: чинні працівники, крім самого працівника процесу. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireAccess(Number((await params).id));
  if ("error" in access) return access.error;

  const people = await prisma.employment.findMany({
    where: { status: EmploymentStatus.ACTIVE, id: { not: access.task.instance.employmentId } },
    include: { person: true, staffUnit: { include: { positionProfile: true, orgNode: true } } },
    orderBy: [{ staffUnit: { positionProfile: { level: "desc" } } }, { person: { fullName: "asc" } }],
    take: 300,
  });
  return NextResponse.json(
    people.map((e) => ({ employmentId: e.id, fullName: e.person.fullName, positionTitle: e.staffUnit.positionProfile.title, objectName: e.staffUnit.orgNode.name })),
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const taskId = Number((await params).id);
  const access = await requireAccess(taskId);
  if ("error" in access) return access.error;
  const { session, task } = access;

  if (task.status === TaskStatus.DONE) return NextResponse.json({ error: "Задача вже виконана" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const toEmploymentId = Number(body?.toEmploymentId);
  if (!Number.isInteger(toEmploymentId)) return NextResponse.json({ error: "Оберіть нового виконавця" }, { status: 400 });
  if (toEmploymentId === task.instance.employmentId && task.itemTemplate.responsibleRole !== "EMPLOYEE") {
    return NextResponse.json({ error: "Працівник не може виконувати власні пункти погодження" }, { status: 400 });
  }

  const target = await prisma.employment.findUnique({ where: { id: toEmploymentId }, include: { person: true } });
  if (!target || target.status === EmploymentStatus.TERMINATED) return NextResponse.json({ error: "Працівника не знайдено" }, { status: 404 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  await prisma.task.update({ where: { id: taskId }, data: { assigneeId: toEmploymentId } });
  await logAudit({
    actorId: actor?.id ?? null,
    action: "task.reassigned",
    entityType: "Task",
    entityId: taskId,
    diff: { taskTitle: task.itemTemplate.title, from: task.assigneeId, to: toEmploymentId },
  });
  return NextResponse.json({ ok: true });
}
