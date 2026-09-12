import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { checkBeyondProfileBadge, checkProfileClosedBadge } from "../../../../../lib/rating";
import { Capability, CompetencySource } from "../../../../../generated/prisma/client";

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Ручний запис компетенції "понад профіль" (docs v1.2 §1, беджд
 * beyond_profile). Обмежено бонусними компетенціями — для звичайних,
 * що вимагаються профілем, є реальні шляхи (тест, атестація); ручний
 * запис "required"-компетенції обійшов би ці перевірки.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const allowed = await can(session.id, Capability.RUN_ATTESTATION, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права записувати компетенції понад профіль" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const competencyId = Number(body?.competencyId);
  if (!Number.isInteger(competencyId)) return NextResponse.json({ error: "Потрібна компетенція" }, { status: 400 });

  const competency = await prisma.competency.findUnique({ where: { id: competencyId } });
  if (!competency) return NextResponse.json({ error: "Компетенцію не знайдено" }, { status: 404 });
  if (!competency.isBonus) {
    return NextResponse.json({ error: "Тут можна записати лише бонусну компетенцію (понад профіль)" }, { status: 400 });
  }

  const score = body?.score != null && body.score !== "" ? Number(body.score) : null;
  if (score != null && (!Number.isInteger(score) || score < 0 || score > 100)) {
    return NextResponse.json({ error: "Бал має бути цілим числом від 0 до 100" }, { status: 400 });
  }

  const now = new Date();
  await prisma.competencyRecord.create({
    data: {
      personId: employment.personId,
      competencyId,
      passedAt: now,
      score,
      validUntil: competency.validMonths ? addMonths(now, competency.validMonths) : null,
      source: CompetencySource.MANUAL,
    },
  });

  await checkBeyondProfileBadge(employment.personId);
  await checkProfileClosedBadge(employment.personId);

  return NextResponse.json({ ok: true });
}
