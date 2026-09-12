import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { assignEquipment } from "../../../../../lib/equipment";
import { Capability, EmploymentStatus } from "../../../../../generated/prisma/client";

async function loadEmployment(employmentId: number) {
  return prisma.employment.findUnique({
    where: { id: employmentId },
    include: { staffUnit: { include: { orgNode: true } } },
  });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await loadEmployment(employmentId);
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.VIEW_EMPLOYEE, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає доступу" }, { status: 403 });

  const equipment = await prisma.equipment.findMany({
    where: { responsibleId: employmentId, isActive: true },
    orderBy: { inventoryNo: "asc" },
  });

  return NextResponse.json(equipment.map((e) => ({ id: e.id, inventoryNo: e.inventoryNo, name: e.name, assignedAt: e.assignedAt })));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await loadEmployment(employmentId);
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.ASSIGN_EQUIPMENT, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права закріплювати обладнання" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const inventoryNo = body?.inventoryNo;
  const name = body?.name;
  if (typeof inventoryNo !== "string" || typeof name !== "string" || !inventoryNo.trim() || !name.trim()) {
    return NextResponse.json({ error: "Потрібні інвентарний номер і назва" }, { status: 400 });
  }

  const actorEmployment = await prisma.employment.findFirst({
    where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } },
  });
  if (!actorEmployment) return NextResponse.json({ error: "У вас немає активного працевлаштування" }, { status: 400 });

  const equipment = await assignEquipment({
    inventoryNo: inventoryNo.trim(),
    name: name.trim(),
    orgNodeId: employment.staffUnit.orgNode.id,
    responsibleId: employmentId,
    performedById: actorEmployment.id,
  });

  return NextResponse.json({ id: equipment.id, inventoryNo: equipment.inventoryNo, name: equipment.name });
}
