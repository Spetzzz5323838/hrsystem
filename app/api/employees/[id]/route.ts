import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { can } from "../../../../lib/permissions";
import { getCompetencyDelta } from "../../../../lib/competencies";
import { updateProfileFields } from "../../../../lib/onboarding";
import { Capability, EmploymentStatus } from "../../../../generated/prisma/client";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) {
    return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  }

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) {
    return NextResponse.json({ error: "Невірний id" }, { status: 400 });
  }

  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: {
      person: true,
      staffUnit: { include: { positionProfile: true, orgNode: true } },
      curator: { include: { person: true } },
    },
  });

  if (!employment) {
    return NextResponse.json({ error: "Працівника не знайдено" }, { status: 404 });
  }

  const allowed = await can(session.id, Capability.VIEW_EMPLOYEE, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Немає доступу до цього працівника" }, { status: 403 });
  }

  const competencies = await getCompetencyDelta(employment.personId, employment.staffUnit.positionProfileId);

  // Понад профіль (docs v1.2 §1): бонусні компетенції не входять у
  // PositionCompetency жодної посади, тому getCompetencyDelta їх не
  // бачить — показуємо окремим списком фактично здобутих.
  const bonusRecords = await prisma.competencyRecord.findMany({
    where: { personId: employment.personId, competency: { isBonus: true } },
    include: { competency: true },
    orderBy: { passedAt: "desc" },
  });
  const now = new Date();
  const bonusCompetencies = bonusRecords.map((r) => ({
    competencyId: r.competencyId,
    name: r.competency.name,
    passedAt: r.passedAt,
    validUntil: r.validUntil,
    score: r.score,
    expired: r.validUntil != null && r.validUntil < now,
  }));

  return NextResponse.json({
    employmentId: employment.id,
    fullName: employment.person.fullName,
    phone: employment.person.phone,
    birthDate: employment.person.birthDate,
    positionTitle: employment.staffUnit.positionProfile.title,
    objectName: employment.staffUnit.orgNode.name,
    status: employment.status,
    hiredAt: employment.hiredAt,
    terminatedAt: employment.terminatedAt,
    curatorName: employment.curator?.person.fullName ?? null,
    staffUnitId: employment.staffUnitId,
    competencies,
    bonusCompetencies,
  });
}

/**
 * Редагування "Заповнення профілю: посада, відділ, дата виходу" (правки
 * 20.09.2026, п.9) — той самий гейт EDIT_PROFILE, що й інші дії
 * адміністратора над профілем. Доступність за статусом (тільки поки не
 * ACTIVE) перевіряється в lib/onboarding.ts::updateProfileFields.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await prisma.employment.findUnique({ where: { id: employmentId }, include: { staffUnit: { include: { orgNode: true } } } });
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.EDIT_PROFILE, { personId: employment.personId, orgNodePath: employment.staffUnit.orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати профіль" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const patch: { staffUnitId?: number; hiredAt?: Date; birthDate?: Date | null } = {};

  if (body?.staffUnitId !== undefined) {
    const staffUnitId = Number(body.staffUnitId);
    if (!Number.isInteger(staffUnitId)) return NextResponse.json({ error: "Невірна штатна одиниця" }, { status: 400 });
    patch.staffUnitId = staffUnitId;
  }
  if (body?.hiredAt !== undefined) {
    const hiredAt = new Date(body.hiredAt);
    if (Number.isNaN(hiredAt.getTime())) return NextResponse.json({ error: "Невірна дата виходу" }, { status: 400 });
    patch.hiredAt = hiredAt;
  }
  if (body?.birthDate !== undefined) {
    if (body.birthDate === null) {
      patch.birthDate = null;
    } else {
      const birthDate = new Date(body.birthDate);
      if (Number.isNaN(birthDate.getTime())) return NextResponse.json({ error: "Невірна дата народження" }, { status: 400 });
      patch.birthDate = birthDate;
    }
  }

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const result = await updateProfileFields(employmentId, patch, actor.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
