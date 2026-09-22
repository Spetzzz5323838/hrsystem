import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson, resetCabinetPassword } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { sendNotification } from "../../../../../lib/notificationTemplates";
import { Capability, EmploymentStatus } from "../../../../../generated/prisma/client";

/**
 * Ручний скид пароля кабінету адміністратором (правки 20.09.2026, п.1) —
 * той самий принцип, що й перевидача пароля 1С: гейт через можливість
 * (RESET_CABINET_PASSWORD), не жорстка перевірка ролі.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: { person: true, staffUnit: { include: { orgNode: true } } },
  });
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.RESET_CABINET_PASSWORD, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права скидати пароль кабінету" }, { status: 403 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const password = await resetCabinetPassword(employment.personId, actor.id);

  const sentViaBot = !!employment.person.telegramId;
  if (sentViaBot) {
    await sendNotification(employment.personId, "auth.cabinetPasswordReset", { password });
  }

  return NextResponse.json({ ok: true, password, sentViaBot });
}
