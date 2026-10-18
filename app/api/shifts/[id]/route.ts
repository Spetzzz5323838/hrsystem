import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { can } from "../../../../lib/permissions";
import { editShift } from "../../../../lib/timesheet";
import { Capability, EmploymentStatus } from "../../../../generated/prisma/client";

/** Виправлення часу зміни: { startedAt, endedAt | null, reason }. Відкриту зміну можна закрити, передавши endedAt. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const shiftId = Number((await params).id);
  if (!Number.isInteger(shiftId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const shift = await prisma.workShift.findUnique({ where: { id: shiftId }, include: { orgNode: true } });
  if (!shift) return NextResponse.json({ error: "Зміну не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.EDIT_SHIFTS, { orgNodePath: shift.orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права виправляти табель цього магазину" }, { status: 403 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const result = await editShift(
    shiftId,
    {
      startedAt: new Date(body?.startedAt),
      endedAt: body?.endedAt ? new Date(body.endedAt) : null,
      reason: typeof body?.reason === "string" ? body.reason : "",
    },
    actor.id,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
