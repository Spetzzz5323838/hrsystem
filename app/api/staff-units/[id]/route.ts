import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { canManageOrgStructure } from "../../../../lib/permissions";
import { logAudit } from "../../../../lib/audit";
import { EmploymentStatus } from "../../../../generated/prisma/client";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageOrgStructure(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати штатний розпис" }, { status: 403 });

  const { id } = await params;
  const staffUnitId = Number(id);
  if (!Number.isInteger(staffUnitId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const plannedHeadcount = Number(body?.plannedHeadcount);
  if (!Number.isInteger(plannedHeadcount) || plannedHeadcount < 1) return NextResponse.json({ error: "План має бути щонайменше 1" }, { status: 400 });

  const staffUnit = await prisma.staffUnit.findUnique({
    where: { id: staffUnitId },
    include: { employments: { where: { status: { not: EmploymentStatus.TERMINATED } } } },
  });
  if (!staffUnit) return NextResponse.json({ error: "Штатну одиницю не знайдено" }, { status: 404 });

  if (plannedHeadcount < staffUnit.employments.length) {
    return NextResponse.json(
      { error: `Не можна поставити план менше за фактичну кількість (зараз працює ${staffUnit.employments.length})` },
      { status: 400 },
    );
  }

  await prisma.staffUnit.update({ where: { id: staffUnitId }, data: { plannedHeadcount } });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  await logAudit({ actorId: actor?.id ?? null, action: "staffUnit.updated", entityType: "StaffUnit", entityId: staffUnitId, diff: { plannedHeadcount } });

  return NextResponse.json({ ok: true });
}

/**
 * Видалення штатної одиниці (правки 20.09.2026, п.13) — заблоковано, якщо
 * на ній є (чи будь-коли було) хоч одне Employment: Employment.staffUnitId
 * обов'язкове поле без ON DELETE SET NULL, тож і на рівні бази це б упало
 * помилкою зовнішнього ключа — тут та сама перевірка, але з людським
 * поясненням ДО спроби видалення, а не сирим P2003. Це й є захист "не
 * дозволяти видалення посади, яка є елементом workflow найму/звільнення" —
 * поки лишається хоч один Employment (навіть звільнений — історія), видалити
 * не можна, жодна активна чи завершена задача не "зависне" без штатної одиниці.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageOrgStructure(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати штатний розпис" }, { status: 403 });

  const { id } = await params;
  const staffUnitId = Number(id);
  if (!Number.isInteger(staffUnitId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const staffUnit = await prisma.staffUnit.findUnique({ where: { id: staffUnitId }, include: { _count: { select: { employments: true } } } });
  if (!staffUnit) return NextResponse.json({ error: "Штатну одиницю не знайдено" }, { status: 404 });

  if (staffUnit._count.employments > 0) {
    return NextResponse.json(
      { error: "Не можна видалити — на цій штатній одиниці є (або були) працівники. Задачі найму/звільнення не можуть лишитись без штатної одиниці." },
      { status: 409 },
    );
  }

  await prisma.staffUnit.delete({ where: { id: staffUnitId } });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  await logAudit({ actorId: actor?.id ?? null, action: "staffUnit.deleted", entityType: "StaffUnit", entityId: staffUnitId });

  return NextResponse.json({ ok: true });
}
