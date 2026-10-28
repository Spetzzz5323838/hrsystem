import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { REASON_LABELS } from "../../../../../lib/timesheetReasons";
import { Capability } from "../../../../../generated/prisma/client";

/** Правки табеля одного працівника за останні 12 місяців — для вкладки в картці. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const employmentId = Number((await params).id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await prisma.employment.findUnique({ where: { id: employmentId }, include: { staffUnit: { include: { orgNode: true } } } });
  if (!employment) return NextResponse.json({ error: "Працівника не знайдено" }, { status: 404 });
  if (!(await can(session.id, Capability.VIEW_TIMESHEET, { orgNodePath: employment.staffUnit.orgNode.path }))) {
    return NextResponse.json({ error: "Немає доступу до табеля цього працівника" }, { status: 403 });
  }

  const since = new Date();
  since.setMonth(since.getMonth() - 12);
  const rows = await prisma.timesheetCorrection.findMany({
    where: { employment: { personId: employment.personId }, createdAt: { gte: since } },
    include: { orgNode: true, actor: { include: { person: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    rows: rows.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      kind: c.kind,
      storeName: c.orgNode.name,
      shiftDate: c.afterStartedAt ?? c.beforeStartedAt ?? c.createdAt,
      beforeStartedAt: c.beforeStartedAt,
      beforeEndedAt: c.beforeEndedAt,
      afterStartedAt: c.afterStartedAt,
      afterEndedAt: c.afterEndedAt,
      deltaMinutes: c.deltaMinutes,
      reasonLabel: REASON_LABELS[c.reason] ?? c.reason,
      comment: c.comment,
      actorName: c.actor?.person.fullName ?? "Система",
      periodClosed: c.periodClosed,
    })),
  });
}
