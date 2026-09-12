import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { canManageTemplates } from "../../../../../lib/permissions";
import { getWeights, REVIEW_CRITERIA } from "../../../../../lib/review";
import { ReviewCriterion } from "../../../../../generated/prisma/client";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const positionProfileId = Number(id);
  if (!Number.isInteger(positionProfileId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const weights = await getWeights(positionProfileId);
  return NextResponse.json(REVIEW_CRITERIA.map((criterion) => ({ criterion, weight: weights[criterion] })));
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageTemplates(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати ваги критеріїв" }, { status: 403 });

  const { id } = await params;
  const positionProfileId = Number(id);
  if (!Number.isInteger(positionProfileId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const criterion = body?.criterion as ReviewCriterion | undefined;
  const weight = Number(body?.weight);
  if (!criterion || !REVIEW_CRITERIA.includes(criterion)) {
    return NextResponse.json({ error: "Невірний критерій" }, { status: 400 });
  }
  if (!Number.isInteger(weight) || weight < 1 || weight > 10) {
    return NextResponse.json({ error: "Вага має бути цілим числом від 1 до 10" }, { status: 400 });
  }

  await prisma.reviewCriterionWeight.upsert({
    where: { positionProfileId_criterion: { positionProfileId, criterion } },
    update: { weight },
    create: { positionProfileId, criterion, weight },
  });

  return NextResponse.json({ ok: true });
}
