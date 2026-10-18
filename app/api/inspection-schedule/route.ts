import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { hasAccess } from "../../../lib/access";
import { getScopePaths } from "../../../lib/timesheet";
import { Capability, InspectionStatus, OrgNodeType } from "../../../generated/prisma/client";

/** Магазини в області MANAGE_INSPECTION_SCHEDULE: розклад кожного та найближчі заплановані обходи. */
export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getScopePaths(session.id, Capability.MANAGE_INSPECTION_SCHEDULE);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до розкладу обходів" }, { status: 403 });

  const nodes = await prisma.orgNode.findMany({
    where: { type: OrgNodeType.OBJECT, isActive: true },
    orderBy: { name: "asc" },
    include: { inspectionSchedule: true, inspections: { where: { status: { in: [InspectionStatus.PLANNED, InspectionStatus.IN_PROGRESS] } }, orderBy: { plannedFor: "asc" } } },
  });

  return NextResponse.json({
    stores: nodes
      .filter((n) => scopePaths.some((p) => hasAccess(p, n.path)))
      .map((n) => ({
        id: n.id,
        name: n.name,
        dailyTime: n.inspectionSchedule?.dailyTime ?? null,
        weeklyDay: n.inspectionSchedule?.weeklyDay ?? null,
        weeklyTime: n.inspectionSchedule?.weeklyTime ?? null,
        upcoming: n.inspections.map((i) => ({ id: i.id, kind: i.kind, status: i.status, plannedFor: i.plannedFor, postponedCount: i.postponedCount })),
      })),
  });
}
