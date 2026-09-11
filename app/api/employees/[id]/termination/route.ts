import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { startTermination } from "../../../../../lib/termination";
import { getInstanceTasks } from "../../../../../lib/onboarding";
import { Capability, EmploymentStatus, ProcessType } from "../../../../../generated/prisma/client";

async function loadEmployment(employmentId: number) {
  return prisma.employment.findUnique({
    where: { id: employmentId },
    include: { staffUnit: { include: { orgNode: true } } },
  });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await loadEmployment(employmentId);
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.VIEW_EMPLOYEE, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає доступу" }, { status: 403 });

  const instance = await prisma.processInstance.findFirst({
    where: { employmentId, template: { type: ProcessType.OFFBOARDING } },
    orderBy: { startedAt: "desc" },
  });
  if (!instance) return NextResponse.json({ instance: null, tasks: [] });

  const tasks = await getInstanceTasks(instance.id);
  return NextResponse.json({
    instance: { id: instance.id, state: instance.state, startedAt: instance.startedAt, finishedAt: instance.finishedAt },
    tasks,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await loadEmployment(employmentId);
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.INIT_TERMINATION, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права ініціювати звільнення цього працівника" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const reasonCode = body?.reasonCode;
  const lastWorkingDay = body?.lastWorkingDay ? new Date(body.lastWorkingDay) : null;
  if (typeof reasonCode !== "string" || !lastWorkingDay) {
    return NextResponse.json({ error: "Потрібні причина й останній робочий день" }, { status: 400 });
  }

  const initiatorEmployment = await prisma.employment.findFirst({
    where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } },
  });
  if (!initiatorEmployment) return NextResponse.json({ error: "У вас немає активного працевлаштування" }, { status: 400 });

  const result = await startTermination(employmentId, { reasonCode, lastWorkingDay }, initiatorEmployment.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  const tasks = await getInstanceTasks(result.instanceId);
  return NextResponse.json({ instanceId: result.instanceId, tasks });
}
