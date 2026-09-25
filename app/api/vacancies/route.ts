import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { can } from "../../../lib/permissions";
import { createVacancy, listVacancies, getVacancyScopePaths, VACANCY_REASON_LABELS } from "../../../lib/vacancies";
import { Capability, EmploymentStatus, VacancyReason } from "../../../generated/prisma/client";

export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getVacancyScopePaths(session.id);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до вакансій" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const includeClosed = searchParams.get("includeClosed") === "true";

  const vacancies = await listVacancies(scopePaths, includeClosed);
  return NextResponse.json(
    vacancies.map((v) => ({
      id: v.id,
      positionTitle: v.staffUnit.positionProfile.title,
      objectName: v.staffUnit.orgNode.name,
      reason: v.reason,
      reasonLabel: VACANCY_REASON_LABELS[v.reason],
      status: v.status,
      note: v.note,
      createdAt: v.createdAt,
      postedAt: v.postedAt,
      closedAt: v.closedAt,
    })),
  );
}

/** Ручне створення вакансії (правки з розмови 2026-09-23) — напр. при зростанні плану штатної одиниці. */
export async function POST(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const staffUnitId = Number(body?.staffUnitId);
  const reason = body?.reason;
  if (!Number.isInteger(staffUnitId)) return NextResponse.json({ error: "Потрібна штатна одиниця" }, { status: 400 });
  if (!Object.values(VacancyReason).includes(reason)) return NextResponse.json({ error: "Невірна причина вакансії" }, { status: 400 });

  const staffUnit = await prisma.staffUnit.findUnique({ where: { id: staffUnitId }, include: { orgNode: true } });
  if (!staffUnit) return NextResponse.json({ error: "Штатну одиницю не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.MANAGE_VACANCIES, { orgNodePath: staffUnit.orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права створювати вакансії" }, { status: 403 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const result = await createVacancy(staffUnitId, reason as VacancyReason, actor.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.id });
}
