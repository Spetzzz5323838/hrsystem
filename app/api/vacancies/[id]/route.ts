import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { can } from "../../../../lib/permissions";
import { updateVacancy } from "../../../../lib/vacancies";
import { Capability, EmploymentStatus, VacancyStatus } from "../../../../generated/prisma/client";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const vacancyId = Number(id);
  if (!Number.isInteger(vacancyId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const vacancy = await prisma.vacancy.findUnique({ where: { id: vacancyId }, include: { staffUnit: { include: { orgNode: true } } } });
  if (!vacancy) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.MANAGE_VACANCIES, { orgNodePath: vacancy.staffUnit.orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати вакансії" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const status = body?.status;
  if (status !== undefined && !Object.values(VacancyStatus).includes(status)) {
    return NextResponse.json({ error: "Невірний статус" }, { status: 400 });
  }

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const result = await updateVacancy(vacancyId, { status, note: body?.note }, actor.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
