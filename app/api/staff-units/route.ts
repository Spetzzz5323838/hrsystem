import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { canManageOrgStructure } from "../../../lib/permissions";
import { logAudit } from "../../../lib/audit";
import { EmploymentStatus } from "../../../generated/prisma/client";

export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const orgNodeIdParam = searchParams.get("orgNodeId");
  const orgNodeId = orgNodeIdParam ? Number(orgNodeIdParam) : undefined;

  const staffUnits = await prisma.staffUnit.findMany({
    where: orgNodeId ? { orgNodeId } : undefined,
    include: {
      positionProfile: { select: { title: true } },
      orgNode: { select: { name: true } },
      employments: { where: { status: { not: EmploymentStatus.TERMINATED } }, select: { id: true } },
    },
    orderBy: [{ orgNode: { name: "asc" } }, { positionProfile: { title: "asc" } }],
  });

  return NextResponse.json(
    staffUnits.map((su) => ({
      id: su.id,
      positionProfileId: su.positionProfileId,
      positionTitle: su.positionProfile.title,
      orgNodeId: su.orgNodeId,
      objectName: su.orgNode.name,
      plannedHeadcount: su.plannedHeadcount,
      actualCount: su.employments.length,
    })),
  );
}

/**
 * Додавання посади в штатний розпис вузла (правки 20.09.2026, п.13) —
 * раніше штатний розпис можна було лише переглядати. Унікальність
 * (positionProfileId, orgNodeId) уже гарантована схемою — дубль підказує
 * відредагувати наявний рядок, а не створює новий.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageOrgStructure(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати штатний розпис" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const positionProfileId = Number(body?.positionProfileId);
  const orgNodeId = Number(body?.orgNodeId);
  const plannedHeadcount = body?.plannedHeadcount != null ? Number(body.plannedHeadcount) : 1;

  if (!Number.isInteger(positionProfileId)) return NextResponse.json({ error: "Потрібна посада" }, { status: 400 });
  if (!Number.isInteger(orgNodeId)) return NextResponse.json({ error: "Потрібен вузол" }, { status: 400 });
  if (!Number.isInteger(plannedHeadcount) || plannedHeadcount < 1) return NextResponse.json({ error: "План має бути щонайменше 1" }, { status: 400 });

  const [position, node] = await Promise.all([
    prisma.positionProfile.findUnique({ where: { id: positionProfileId } }),
    prisma.orgNode.findUnique({ where: { id: orgNodeId } }),
  ]);
  if (!position) return NextResponse.json({ error: "Посаду не знайдено" }, { status: 404 });
  if (!node) return NextResponse.json({ error: "Вузол не знайдено" }, { status: 404 });

  const existing = await prisma.staffUnit.findUnique({ where: { positionProfileId_orgNodeId: { positionProfileId, orgNodeId } } });
  if (existing) return NextResponse.json({ error: "Ця посада вже є в штатному розписі цього вузла — відредагуйте план замість дублю" }, { status: 409 });

  const staffUnit = await prisma.staffUnit.create({ data: { positionProfileId, orgNodeId, plannedHeadcount } });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  await logAudit({
    actorId: actor?.id ?? null,
    action: "staffUnit.created",
    entityType: "StaffUnit",
    entityId: staffUnit.id,
    diff: { positionProfileId, orgNodeId, plannedHeadcount },
  });

  return NextResponse.json({ id: staffUnit.id });
}
