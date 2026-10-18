import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { can } from "../../../../lib/permissions";
import { saveSchedule, validateSchedule } from "../../../../lib/inspections";
import { Capability, EmploymentStatus, OrgNodeType } from "../../../../generated/prisma/client";

/** Розклад обходів магазину: { dailyTime: "09:00"|null, weeklyDay: 1..7|null, weeklyTime: "10:00"|null }. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const storeId = Number((await params).storeId);
  const node = Number.isInteger(storeId) ? await prisma.orgNode.findUnique({ where: { id: storeId } }) : null;
  if (!node || node.type !== OrgNodeType.OBJECT) return NextResponse.json({ error: "Магазин не знайдено" }, { status: 404 });
  if (!(await can(session.id, Capability.MANAGE_INSPECTION_SCHEDULE, { orgNodePath: node.path }))) {
    return NextResponse.json({ error: "Немає права змінювати розклад обходів цього магазину" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = validateSchedule(body ?? {});
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  await saveSchedule(storeId, parsed.value, actor?.id ?? null);
  return NextResponse.json({ ok: true });
}
