import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../../lib/auth";
import { can } from "../../../../../../lib/permissions";
import { revokeCuratorEligibility } from "../../../../../../lib/curator";
import { Capability, EmploymentStatus } from "../../../../../../generated/prisma/client";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; positionProfileId: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id, positionProfileId } = await params;
  const employmentId = Number(id);
  const posId = Number(positionProfileId);
  if (!Number.isInteger(employmentId) || !Number.isInteger(posId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await prisma.employment.findUnique({ where: { id: employmentId }, include: { staffUnit: { include: { orgNode: true } } } });
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.ASSIGN_CURATOR, { personId: employment.personId, orgNodePath: employment.staffUnit.orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права керувати кураторством" }, { status: 403 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  await revokeCuratorEligibility(employmentId, posId, actor.id);
  return NextResponse.json({ ok: true });
}
