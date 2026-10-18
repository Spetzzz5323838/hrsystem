import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { logAudit } from "../../../../lib/audit";
import { getScopePaths } from "../../../../lib/timesheet";
import { Capability, EmploymentStatus } from "../../../../generated/prisma/client";

/** Зміна типу: назва, ознаки "має бути персонал"/"загальна", активність (замість видалення — типи вже можуть бути в магазинах). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await getScopePaths(session.id, Capability.MANAGE_AREA_TYPES)).length) return NextResponse.json({ error: "Немає права змінювати типи ділянок" }, { status: 403 });

  const id = Number((await params).id);
  const current = Number.isInteger(id) ? await prisma.areaType.findUnique({ where: { id } }) : null;
  if (!current) return NextResponse.json({ error: "Тип не знайдено" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const data: { name?: string; requiresStaff?: boolean; isGeneral?: boolean; isActive?: boolean } = {};
  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Назва не може бути порожньою" }, { status: 400 });
    const clash = await prisma.areaType.findUnique({ where: { name } });
    if (clash && clash.id !== id) return NextResponse.json({ error: "Тип з такою назвою вже є" }, { status: 409 });
    data.name = name;
  }
  if (typeof body?.isActive === "boolean") data.isActive = body.isActive;
  if (typeof body?.isGeneral === "boolean") data.isGeneral = body.isGeneral;
  if (typeof body?.requiresStaff === "boolean") data.requiresStaff = body.requiresStaff;
  // Загальна ділянка не має закріплених працівників, тож "має бути персонал" для неї безглуздо.
  if ((data.isGeneral ?? current.isGeneral) === true) data.requiresStaff = false;

  await prisma.areaType.update({ where: { id }, data });
  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  await logAudit({ actorId: actor?.id ?? null, action: "areaType.updated", entityType: "AreaType", entityId: id, diff: data });
  return NextResponse.json({ ok: true });
}
