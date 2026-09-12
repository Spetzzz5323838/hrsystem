import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { confirmConversation } from "../../../../../lib/review";
import { Capability, EmploymentStatus } from "../../../../../generated/prisma/client";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { employment: { include: { staffUnit: { include: { orgNode: true } } } } },
  });
  if (!review) return NextResponse.json({ error: "Оцінку не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.RATE_POSITIVE_NEGATIVE, {
    personId: review.employment.personId,
    orgNodePath: review.employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права підтверджувати бесіду" }, { status: 403 });

  const actorEmployment = await prisma.employment.findFirst({
    where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } },
  });
  if (!actorEmployment) return NextResponse.json({ error: "У вас немає активного працевлаштування" }, { status: 400 });

  const result = await confirmConversation(reviewId, actorEmployment.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({ ok: true });
}
