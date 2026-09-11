import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { startOnboarding, getInstanceTasks } from "../../../../../lib/onboarding";
import { Capability } from "../../../../../generated/prisma/client";

async function loadEmploymentOrError(employmentId: number) {
  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: { staffUnit: { include: { orgNode: true } } },
  });
  if (!employment) return null;
  return employment;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await loadEmploymentOrError(employmentId);
  if (!employment) return NextResponse.json({ error: "Працівника не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.VIEW_EMPLOYEE, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає доступу" }, { status: 403 });

  const instance = await prisma.processInstance.findFirst({
    where: { employmentId },
    orderBy: { startedAt: "desc" },
  });
  if (!instance) return NextResponse.json({ instance: null, tasks: [] });

  const tasks = await getInstanceTasks(instance.id);
  return NextResponse.json({
    instance: { id: instance.id, state: instance.state, startedAt: instance.startedAt, finishedAt: instance.finishedAt },
    tasks,
  });
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await loadEmploymentOrError(employmentId);
  if (!employment) return NextResponse.json({ error: "Працівника не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.ACTIVATE_EMPLOYEE, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права запускати онбординг для цього працівника" }, { status: 403 });

  const result = await startOnboarding(employmentId);
  const instance = await prisma.processInstance.findUniqueOrThrow({ where: { id: result.instanceId } });
  const tasks = await getInstanceTasks(result.instanceId);

  return NextResponse.json({
    alreadyExisted: result.alreadyExisted,
    instance: { id: instance.id, state: instance.state, startedAt: instance.startedAt, finishedAt: instance.finishedAt },
    tasks,
  });
}
