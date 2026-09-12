import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { clearEquipment } from "../../../../../lib/equipment";
import { Capability, EmploymentStatus } from "../../../../../generated/prisma/client";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const equipmentId = Number(id);
  if (!Number.isInteger(equipmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const equipment = await prisma.equipment.findUnique({ where: { id: equipmentId }, include: { orgNode: true } });
  if (!equipment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.CLEAR_EQUIPMENT, {
    orgNodePath: equipment.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права квитувати обладнання" }, { status: 403 });

  const actorEmployment = await prisma.employment.findFirst({
    where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } },
  });
  if (!actorEmployment) return NextResponse.json({ error: "У вас немає активного працевлаштування" }, { status: 400 });

  await clearEquipment(equipmentId, actorEmployment.id);
  return NextResponse.json({ ok: true });
}
