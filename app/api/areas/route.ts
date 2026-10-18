import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { hasAccess } from "../../../lib/access";
import { can } from "../../../lib/permissions";
import { logAudit } from "../../../lib/audit";
import { getScopePaths } from "../../../lib/timesheet";
import { listStoreCandidates } from "../../../lib/areas";
import { Capability, EmploymentStatus, OrgNodeType } from "../../../generated/prisma/client";

/** Магазини в області MANAGE_AREAS; для обраного (?storeId=) — ділянки, відповідальні, кандидати й час відкриття. */
export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getScopePaths(session.id, Capability.MANAGE_AREAS);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до ділянок" }, { status: 403 });

  const nodes = await prisma.orgNode.findMany({ where: { type: OrgNodeType.OBJECT, isActive: true }, orderBy: { name: "asc" } });
  const stores = nodes.filter((n) => scopePaths.some((p) => hasAccess(p, n.path)));

  const storeId = Number(request.nextUrl.searchParams.get("storeId"));
  const store = stores.find((s) => s.id === storeId) ?? null;
  if (!store) return NextResponse.json({ stores: stores.map((s) => ({ id: s.id, name: s.name })), store: null });

  const areas = await prisma.area.findMany({
    where: { orgNodeId: store.id },
    include: {
      areaType: true,
      responsibles: { include: { employment: { include: { person: true } } } },
    },
    orderBy: [{ areaType: { sortOrder: "asc" } }, { id: "asc" }],
  });

  return NextResponse.json({
    stores: stores.map((s) => ({ id: s.id, name: s.name })),
    store: { id: store.id, name: store.name, openTime: store.openTime },
    candidates: await listStoreCandidates(store.id),
    areas: areas.map((a) => ({
      id: a.id,
      isActive: a.isActive,
      typeId: a.areaTypeId,
      name: a.areaType.name,
      requiresStaff: a.areaType.requiresStaff,
      isGeneral: a.areaType.isGeneral,
      responsibles: a.responsibles
        .filter((r) => r.employment.status !== EmploymentStatus.TERMINATED)
        .map((r) => ({ employmentId: r.employmentId, fullName: r.employment.person.fullName })),
    })),
  });
}

/** Додає ділянку в магазин: { orgNodeId, areaTypeId }. Знята раніше ділянка відновлюється з тими ж відповідальними. */
export async function POST(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const orgNodeId = Number(body?.orgNodeId);
  const areaTypeId = Number(body?.areaTypeId);
  if (!Number.isInteger(orgNodeId) || !Number.isInteger(areaTypeId)) return NextResponse.json({ error: "Потрібні магазин і тип ділянки" }, { status: 400 });

  const node = await prisma.orgNode.findUnique({ where: { id: orgNodeId } });
  if (!node || node.type !== OrgNodeType.OBJECT) return NextResponse.json({ error: "Магазин не знайдено" }, { status: 404 });
  if (!(await can(session.id, Capability.MANAGE_AREAS, { orgNodePath: node.path }))) return NextResponse.json({ error: "Немає права керувати ділянками цього магазину" }, { status: 403 });

  const type = await prisma.areaType.findUnique({ where: { id: areaTypeId } });
  if (!type || !type.isActive) return NextResponse.json({ error: "Тип ділянки не знайдено" }, { status: 404 });

  const existing = await prisma.area.findUnique({ where: { orgNodeId_areaTypeId: { orgNodeId, areaTypeId } } });
  const area = existing
    ? await prisma.area.update({ where: { id: existing.id }, data: { isActive: true } })
    : await prisma.area.create({ data: { orgNodeId, areaTypeId } });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  await logAudit({ actorId: actor?.id ?? null, action: "area.added", entityType: "Area", entityId: area.id, diff: { orgNodeId, type: type.name } });
  return NextResponse.json({ id: area.id });
}
