import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { completeTask, completeCuratorAssignmentTask } from "../../../../../lib/onboarding";
import { completeTransferTask } from "../../../../../lib/transfer";
import { completeTerminationTask } from "../../../../../lib/termination";
import { ProcessType } from "../../../../../generated/prisma/client";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignee: { select: { id: true, personId: true } }, instance: { include: { template: true } }, itemTemplate: true },
  });
  if (!task) return NextResponse.json({ error: "Задачу не знайдено" }, { status: 404 });

  if (!task.assignee || task.assignee.personId !== session.id) {
    return NextResponse.json({ error: "Цю задачу виконує інша людина" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const curatorEmploymentId = Number(body?.curatorEmploymentId);

  // Переведення й звільнення мають побічні ефекти при закритті чек-ліста
  // (переніс на нову штатну одиницю / статус TERMINATED); "Призначення
  // куратора" ставить Employment.curatorId — інші пункти йдуть через
  // звичайний completeTask.
  let result;
  if (task.itemTemplate.title === "Призначення куратора") {
    if (!Number.isInteger(curatorEmploymentId)) {
      return NextResponse.json({ error: "Потрібно обрати куратора" }, { status: 400 });
    }
    result = await completeCuratorAssignmentTask(taskId, curatorEmploymentId, task.assignee.id);
  } else if (task.instance.template.type === ProcessType.TRANSFER) {
    result = await completeTransferTask(taskId, task.assignee.id);
  } else if (task.instance.template.type === ProcessType.OFFBOARDING) {
    result = await completeTerminationTask(taskId, task.assignee.id);
  } else {
    result = await completeTask(taskId, task.assignee.id);
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({ ok: true });
}
