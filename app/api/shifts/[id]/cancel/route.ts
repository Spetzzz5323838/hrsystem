import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { cancelShift, canEditClosedPeriod } from "../../../../../lib/timesheet";
import { Capability, EmploymentStatus } from "../../../../../generated/prisma/client";

/** Скасування зміни: { reason (код зі списку), comment }. Зміна лишається в журналі, години не рахуються. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const shiftId = Number((await params).id);
  if (!Number.isInteger(shiftId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const shift = await prisma.workShift.findUnique({ where: { id: shiftId }, include: { orgNode: true } });
  if (!shift) return NextResponse.json({ error: "Зміну не знайдено" }, { status: 404 });
  if (!(await can(session.id, Capability.EDIT_SHIFTS, { orgNodePath: shift.orgNode.path }))) {
    return NextResponse.json({ error: "Немає права виправляти табель цього магазину" }, { status: 403 });
  }

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const result = await cancelShift(
    shiftId,
    { reason: typeof body?.reason === "string" ? body.reason : "", comment: typeof body?.comment === "string" ? body.comment : "" },
    actor.id,
    await canEditClosedPeriod(session.id),
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
