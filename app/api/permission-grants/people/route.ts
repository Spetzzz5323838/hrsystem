import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { canManagePermissions } from "../../../../lib/permissions";
import { EmploymentStatus } from "../../../../generated/prisma/client";

/**
 * Список людей для вибору в "Симуляції" (docs catalogs-v1.1.md §4.5) —
 * окремий від /api/employees, бо той фільтрує за VIEW_EMPLOYEE, а
 * MANAGE_PERMISSIONS (напр. системний адміністратор) цього права не має.
 * Віддає лише ім'я/посаду/об'єкт — не персональні дані.
 */
export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManagePermissions(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати права доступу" }, { status: 403 });
  }

  const employments = await prisma.employment.findMany({
    where: { status: { not: EmploymentStatus.TERMINATED } },
    include: { person: true, staffUnit: { include: { positionProfile: true, orgNode: true } } },
    orderBy: { person: { fullName: "asc" } },
  });

  // Симуляція рахує людину, не окреме працевлаштування (getEffectiveGrants
  // і так агрегує права з УСІХ активних Employment цієї Person) — тож
  // одна людина з кількома одночасними працевлаштуваннями (сумісництво,
  // докс catalogs-v1.1.md §1.1.1) має бути в списку рівно один раз,
  // інакше однаковий personId дублюється в React-ключі на клієнті.
  const byPerson = new Map<number, { personId: number; fullName: string; positionTitle: string; objectName: string }>();
  for (const e of employments) {
    const existing = byPerson.get(e.personId);
    const position = `${e.staffUnit.positionProfile.title} (${e.staffUnit.orgNode.name})`;
    if (existing) existing.positionTitle += ` + ${position}`;
    else byPerson.set(e.personId, { personId: e.personId, fullName: e.person.fullName, positionTitle: position, objectName: e.staffUnit.orgNode.name });
  }

  return NextResponse.json([...byPerson.values()]);
}
