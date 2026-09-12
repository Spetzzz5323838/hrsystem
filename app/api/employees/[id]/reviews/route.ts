import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { createReview, REVIEW_CRITERIA, REVIEW_CRITERION_LABELS } from "../../../../../lib/review";
import { Capability, ReviewCriterion, EmploymentStatus } from "../../../../../generated/prisma/client";

async function loadTargetEmployment(employmentId: number) {
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

  const employment = await loadTargetEmployment(employmentId);
  if (!employment) return NextResponse.json({ error: "Працівника не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.RATE_POSITIVE_NEGATIVE, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає доступу" }, { status: 403 });

  const reviews = await prisma.review.findMany({
    where: { employmentId },
    include: {
      scores: true,
      createdBy: { include: { person: true } },
      conversationConfirmedBy: { include: { person: true } },
    },
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });

  return NextResponse.json({
    criteria: REVIEW_CRITERIA.map((c) => ({ code: c, label: REVIEW_CRITERION_LABELS[c] })),
    reviews: reviews.map((r) => ({
      id: r.id,
      year: r.year,
      quarter: r.quarter,
      weightedScore: r.weightedScore,
      createdByName: r.createdBy.person.fullName,
      createdAt: r.createdAt,
      conversationConfirmedAt: r.conversationConfirmedAt,
      conversationConfirmedByName: r.conversationConfirmedBy?.person.fullName ?? null,
      employeeAcknowledgedAt: r.employeeAcknowledgedAt,
      scores: r.scores.map((s) => ({ criterion: s.criterion, label: REVIEW_CRITERION_LABELS[s.criterion], score: s.score, weight: s.weight })),
    })),
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await loadTargetEmployment(employmentId);
  if (!employment) return NextResponse.json({ error: "Працівника не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.RATE_POSITIVE_NEGATIVE, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права виставляти квартальну оцінку" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const year = Number(body?.year);
  const quarter = Number(body?.quarter);
  const scoresInput = body?.scores;
  if (!Number.isInteger(year) || !Number.isInteger(quarter) || typeof scoresInput !== "object" || scoresInput == null) {
    return NextResponse.json({ error: "Потрібні рік, квартал і оцінки по критеріях" }, { status: 400 });
  }
  const scores = REVIEW_CRITERIA.filter((c) => c in scoresInput).map((c) => ({ criterion: c as ReviewCriterion, score: Number(scoresInput[c]) }));

  const authorEmployment = await prisma.employment.findFirst({
    where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } },
  });
  if (!authorEmployment) return NextResponse.json({ error: "У вас немає активного працевлаштування" }, { status: 400 });

  const result = await createReview(employmentId, { year, quarter, scores }, authorEmployment.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({ ok: true, reviewId: result.reviewId });
}
