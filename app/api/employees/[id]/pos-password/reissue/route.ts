import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../../lib/auth";
import { can } from "../../../../../../lib/permissions";
import { issuePosPassword } from "../../../../../../lib/posPassword";
import { Capability, EmploymentStatus } from "../../../../../../generated/prisma/client";

/**
 * Перевидача пароля до каси (забули/загубили) — система генерує новий і
 * шле штрихкодом у Telegram; старий перестає бути дійсним. Гейт —
 * SET_1C_PASSWORD (оператор 1С і керівництво; назва можливості історична).
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: { staffUnit: { include: { orgNode: true, positionProfile: true } } },
  });
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  if (!employment.staffUnit.positionProfile.requiresCashierAccount) {
    return NextResponse.json({ error: "Для цієї посади пароль до каси не потрібен" }, { status: 400 });
  }

  const allowed = await can(session.id, Capability.SET_1C_PASSWORD, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права перевидавати пароль до каси" }, { status: 403 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  await issuePosPassword(employmentId, actor.id, "posPassword.reissued");
  return NextResponse.json({ ok: true });
}
