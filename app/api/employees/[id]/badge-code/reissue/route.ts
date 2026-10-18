import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../../lib/auth";
import { can } from "../../../../../../lib/permissions";
import { reissueBadgeCode } from "../../../../../../lib/badgeCode";
import { Capability, EmploymentStatus } from "../../../../../../generated/prisma/client";

/**
 * Загублений бейдж — новий код працівника, старий одразу недійсний (його
 * вже не прийме термінал обліку часу). Гейт PRINT_BADGE — той самий, хто
 * друкує бейдж (адміністратор магазину й вище), бо після перевидачі бейдж
 * однаково треба передрукувати.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await prisma.employment.findUnique({ where: { id: employmentId }, include: { staffUnit: { include: { orgNode: true } } } });
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.PRINT_BADGE, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права перевидавати бейдж" }, { status: 403 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  await reissueBadgeCode(employment.personId, actor.id);
  return NextResponse.json({ ok: true });
}
