import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { createRatingEvent, getRatingScore, getLevel, getNextLevel } from "../../../../../lib/rating";
import { Capability, EmploymentStatus } from "../../../../../generated/prisma/client";

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

  const allowed = await can(session.id, Capability.VIEW_EMPLOYEE, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає доступу" }, { status: 403 });

  const score = await getRatingScore(employment.personId);
  const level = getLevel(score);
  const nextLevel = getNextLevel(score);

  const events = await prisma.ratingEvent.findMany({
    where: { personId: employment.personId },
    include: { category: true, author: { include: { person: true } } },
    orderBy: { occurredAt: "desc" },
  });

  const badges = await prisma.badgeAward.findMany({
    where: { personId: employment.personId },
    include: { badge: true, awardedBy: { include: { person: true } } },
    orderBy: { awardedAt: "desc" },
  });

  return NextResponse.json({
    score,
    level,
    nextLevel,
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      categoryName: e.category?.name ?? null,
      points: e.points,
      comment: e.comment,
      visibility: e.visibility,
      authorId: e.authorId,
      authorName: e.author.person.fullName,
      occurredAt: e.occurredAt,
      cancelledAt: e.cancelledAt,
      cancelReason: e.cancelReason,
    })),
    badges: badges.map((b) => ({
      code: b.badgeCode,
      name: b.badge.name,
      description: b.badge.description,
      isAuto: b.badge.isAuto,
      awardedAt: b.awardedAt,
      awardedByName: b.awardedBy?.person.fullName ?? null,
      comment: b.comment,
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

  const body = await request.json().catch(() => null);
  const type = body?.type;
  if (!["POSITIVE", "NEGATIVE", "REPRIMAND", "AWARD"].includes(type)) {
    return NextResponse.json({ error: "Невірний тип події" }, { status: 400 });
  }

  const capability = type === "REPRIMAND" || type === "AWARD" ? Capability.ISSUE_REPRIMAND_AWARD : Capability.RATE_POSITIVE_NEGATIVE;
  const allowed = await can(session.id, capability, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права ставити таку оцінку цьому працівнику" }, { status: 403 });

  const authorEmployment = await prisma.employment.findFirst({
    where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } },
  });
  if (!authorEmployment) return NextResponse.json({ error: "У вас немає активного працевлаштування" }, { status: 400 });

  const result = await createRatingEvent({
    personId: employment.personId,
    authorEmploymentId: authorEmployment.id,
    type,
    categoryCode: body.categoryCode,
    comment: body.comment,
    badgeCode: body.badgeCode,
    confirmedConversation: body.confirmedConversation,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, needsConversationConfirmation: result.needsConversationConfirmation }, { status: 409 });
  }
  return NextResponse.json({ ok: true, eventId: result.eventId });
}
