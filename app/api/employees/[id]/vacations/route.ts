import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { createVacationRequest } from "../../../../../lib/vacation";
import { Capability, EmploymentStatus, VacationType } from "../../../../../generated/prisma/client";

async function loadEmployment(employmentId: number) {
  return prisma.employment.findUnique({ where: { id: employmentId }, include: { staffUnit: { include: { orgNode: true } } } });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  const employment = await loadEmployment(employmentId);
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.VIEW_EMPLOYEE, { personId: employment.personId, orgNodePath: employment.staffUnit.orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права переглядати цього працівника" }, { status: 403 });

  const requests = await prisma.vacationRequest.findMany({
    where: { employmentId },
    include: { createdBy: { include: { person: true } }, decidedBy: { include: { person: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    requests.map((r) => ({
      id: r.id,
      type: r.type,
      fromDate: r.fromDate,
      toDate: r.toDate,
      status: r.status,
      isOutOfSchedule: r.isOutOfSchedule,
      hasConflict: r.hasConflict,
      isCriticalPosition: r.isCriticalPosition,
      requiresEscalation: r.requiresEscalation,
      conflictNote: r.conflictNote,
      createdByName: r.createdBy.person.fullName,
      decidedByName: r.decidedBy?.person.fullName ?? null,
      decidedAt: r.decidedAt,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt,
    })),
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  const employment = await loadEmployment(employmentId);
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  // Подача за працівника у веб (docs v1.2 §4.1) — гейт EDIT_PROFILE, той
  // самий, що й на інші дії адміністратора над профілем. Самоподача через
  // Telegram-бот — окремий, ще не зроблений крок (архітектурне рішення №1:
  // лінійний персонал працює через бот, не веб).
  const allowed = await can(session.id, Capability.EDIT_PROFILE, { personId: employment.personId, orgNodePath: employment.staffUnit.orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права подавати заявку за цього працівника" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const type = body?.type as string | undefined;
  const fromDate = body?.fromDate ? new Date(body.fromDate) : null;
  const toDate = body?.toDate ? new Date(body.toDate) : null;

  if (!type || !(type in VacationType) || !fromDate || !toDate || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "Потрібні тип і коректні дати" }, { status: 400 });
  }

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "У вас немає активного працевлаштування" }, { status: 400 });

  const result = await createVacationRequest(employmentId, { type: type as VacationType, fromDate, toDate }, actor.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, requestId: result.requestId });
}
