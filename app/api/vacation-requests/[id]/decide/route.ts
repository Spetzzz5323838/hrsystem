import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { canApproveVacation, decideVacationRequest } from "../../../../../lib/vacation";
import { EmploymentStatus } from "../../../../../generated/prisma/client";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const requestId = Number(id);
  const vacationRequest = await prisma.vacationRequest.findUnique({
    where: { id: requestId },
    include: { employment: { include: { staffUnit: { include: { orgNode: true } } } } },
  });
  if (!vacationRequest) return NextResponse.json({ error: "Заявку не знайдено" }, { status: 404 });

  const allowed = await canApproveVacation(session.id, vacationRequest.employment.staffUnit.orgNode.path, vacationRequest);
  if (!allowed) {
    const reason = vacationRequest.isCriticalPosition
      ? "Ця заявка вимагає погодження COO (єдиний працівник на посаді)"
      : vacationRequest.requiresEscalation
        ? "Ця заявка вимагає погодження рівнем вище (довша за 14 днів, конфлікт або поза графіком)"
        : "Немає права погоджувати відпустки цього працівника";
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const decision = body?.decision as string | undefined;
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return NextResponse.json({ error: "Потрібне рішення APPROVED або REJECTED" }, { status: 400 });
  }
  if (decision === "REJECTED" && !body?.rejectReason) {
    return NextResponse.json({ error: "Потрібна причина відхилення" }, { status: 400 });
  }

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "У вас немає активного працевлаштування" }, { status: 400 });

  // Погоджувач може за потреби запропонувати інші дати замість бажаних
  // (правки 20.09.2026, п.11) — обидва поля або жодного, часткову пару не приймаємо.
  let newDates: { fromDate: Date; toDate: Date } | undefined;
  if (typeof body?.fromDate === "string" && typeof body?.toDate === "string") {
    const fromDate = new Date(body.fromDate);
    const toDate = new Date(body.toDate);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      return NextResponse.json({ error: "Невірні дати" }, { status: 400 });
    }
    newDates = { fromDate, toDate };
  }

  const result = await decideVacationRequest(requestId, decision, actor.id, body?.rejectReason ?? null, newDates);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
