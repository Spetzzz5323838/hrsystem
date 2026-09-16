import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../../lib/auth";
import { can } from "../../../../../../lib/permissions";
import { reissueOnecPassword } from "../../../../../../lib/onecPassword";
import { Capability, EmploymentStatus } from "../../../../../../generated/prisma/client";

/**
 * Перевидача пароля 1С (docs plan-v1.md §8/§14: "перевидача — тільки
 * ONEC_ADMIN") — тут це можливість SET_1C_PASSWORD, якою за seed володіє
 * оператор 1С і керівництво компанії (той самий принцип, що й для решти
 * можливостей у системі — через профілі доступу, не жорстка перевірка ролі).
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

  const allowed = await can(session.id, Capability.SET_1C_PASSWORD, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права перевидавати пароль 1С" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password.trim()) return NextResponse.json({ error: "Потрібно ввести новий пароль" }, { status: 400 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const result = await reissueOnecPassword(employmentId, password, actor.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}
