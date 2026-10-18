import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { can } from "../../../../lib/permissions";
import { logAudit } from "../../../../lib/audit";
import { Capability, EmploymentStatus } from "../../../../generated/prisma/client";

/**
 * Зміна ділянки: { responsibleIds: number[] } — повний новий список
 * відповідальних; { isActive: boolean } — зняти ділянку з магазину (не
 * видаляємо: на неї посилатимуться результати обходів).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const id = Number((await params).id);
  const area = Number.isInteger(id) ? await prisma.area.findUnique({ where: { id }, include: { orgNode: true, areaType: true } }) : null;
  if (!area) return NextResponse.json({ error: "Ділянку не знайдено" }, { status: 404 });
  if (!(await can(session.id, Capability.MANAGE_AREAS, { orgNodePath: area.orgNode.path }))) return NextResponse.json({ error: "Немає права керувати ділянками цього магазину" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });

  if (typeof body?.isActive === "boolean") {
    await prisma.area.update({ where: { id }, data: { isActive: body.isActive } });
    await logAudit({ actorId: actor?.id ?? null, action: body.isActive ? "area.added" : "area.removed", entityType: "Area", entityId: id, diff: { type: area.areaType.name } });
  }

  if (Array.isArray(body?.responsibleIds)) {
    if (area.areaType.isGeneral) return NextResponse.json({ error: "За загальну ділянку не закріплюються працівники" }, { status: 400 });
    const ids: number[] = [...new Set<number>(body.responsibleIds.map(Number).filter(Number.isInteger))];
    // Лише працівники цього магазину, не звільнені — щоб не повісити ділянку на чужого.
    const valid = await prisma.employment.findMany({
      where: { id: { in: ids }, status: { not: EmploymentStatus.TERMINATED }, staffUnit: { orgNodeId: area.orgNodeId } },
      select: { id: true },
    });
    if (valid.length !== ids.length) return NextResponse.json({ error: "Відповідальними можуть бути лише працівники цього магазину" }, { status: 400 });

    await prisma.$transaction([
      prisma.areaResponsible.deleteMany({ where: { areaId: id, employmentId: { notIn: ids } } }),
      ...ids.map((employmentId) =>
        prisma.areaResponsible.upsert({ where: { areaId_employmentId: { areaId: id, employmentId } }, update: {}, create: { areaId: id, employmentId } }),
      ),
    ]);
    await logAudit({ actorId: actor?.id ?? null, action: "area.responsiblesChanged", entityType: "Area", entityId: id, diff: { type: area.areaType.name, responsibleIds: ids } });
  }

  return NextResponse.json({ ok: true });
}
