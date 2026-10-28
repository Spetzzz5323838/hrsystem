import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { can } from "../../../lib/permissions";
import { canEditClosedPeriod, createManualShift } from "../../../lib/timesheet";
import { Capability, EmploymentStatus } from "../../../generated/prisma/client";

/** Ручне додавання зміни (працівник не відмітився зовсім). Магазин зміни — той, де вона була, гейт EDIT_SHIFTS саме на нього. */
export async function POST(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const employmentId = Number(body?.employmentId);
  const orgNodeId = Number(body?.orgNodeId);
  if (!Number.isInteger(employmentId) || !Number.isInteger(orgNodeId)) return NextResponse.json({ error: "Потрібні працівник і магазин" }, { status: 400 });

  const node = await prisma.orgNode.findUnique({ where: { id: orgNodeId } });
  if (!node) return NextResponse.json({ error: "Магазин не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.EDIT_SHIFTS, { orgNodePath: node.path });
  if (!allowed) return NextResponse.json({ error: "Немає права виправляти табель цього магазину" }, { status: 403 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const result = await createManualShift(
    {
      employmentId,
      orgNodeId,
      startedAt: new Date(body?.startedAt),
      endedAt: new Date(body?.endedAt),
      reason: typeof body?.reason === "string" ? body.reason : "",
      comment: typeof body?.comment === "string" ? body.comment : "",
    },
    actor.id,
    await canEditClosedPeriod(session.id),
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ id: result.shiftId });
}
