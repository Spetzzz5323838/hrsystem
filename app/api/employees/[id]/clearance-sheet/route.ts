import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { generateClearanceSheet } from "../../../../../lib/termination";
import { Capability, EmploymentStatus, ProcessType } from "../../../../../generated/prisma/client";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: { staffUnit: { include: { orgNode: true } } },
  });
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.PRINT_CLEARANCE, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права друкувати лист узгодження" }, { status: 403 });

  const instance = await prisma.processInstance.findFirst({
    where: { employmentId, template: { type: ProcessType.OFFBOARDING } },
    orderBy: { startedAt: "desc" },
  });
  if (!instance) return NextResponse.json({ error: "Звільнення не розпочато" }, { status: 404 });

  const generatorEmployment = await prisma.employment.findFirst({
    where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } },
  });
  if (!generatorEmployment) return NextResponse.json({ error: "У вас немає активного працевлаштування" }, { status: 400 });

  const sheet = await generateClearanceSheet(instance.id, generatorEmployment.id);
  return NextResponse.json(sheet);
}
