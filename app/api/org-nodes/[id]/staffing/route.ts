import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { EmploymentStatus } from "../../../../../generated/prisma/client";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const person = await getSessionPerson();
  if (!person) {
    return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  }

  const { id } = await params;
  const nodeId = Number(id);
  if (!Number.isInteger(nodeId)) {
    return NextResponse.json({ error: "Невірний id вузла" }, { status: 400 });
  }

  const node = await prisma.orgNode.findUnique({ where: { id: nodeId } });
  if (!node) {
    return NextResponse.json({ error: "Вузол не знайдено" }, { status: 404 });
  }

  let headFullName: string | null = null;
  if (node.headEmploymentId) {
    const headEmployment = await prisma.employment.findUnique({
      where: { id: node.headEmploymentId },
      include: { person: true },
    });
    headFullName = headEmployment?.person.fullName ?? null;
  }

  // Піддерево: сам вузол + усі, чий path починається з "<path>."
  const subtreeNodes = await prisma.orgNode.findMany({
    where: { OR: [{ id: node.id }, { path: { startsWith: `${node.path}.` } }] },
    select: { id: true },
  });
  const subtreeIds = subtreeNodes.map((n) => n.id);

  const staffUnits = await prisma.staffUnit.findMany({
    where: { orgNodeId: { in: subtreeIds } },
    include: {
      positionProfile: { select: { id: true, title: true } },
      employments: { where: { status: { not: EmploymentStatus.TERMINATED } } },
    },
  });

  const rosterMap = new Map<number, { positionProfileId: number; title: string; planned: number; actual: number }>();
  let frozenCount = 0;
  for (const staffUnit of staffUnits) {
    const entry = rosterMap.get(staffUnit.positionProfileId) ?? {
      positionProfileId: staffUnit.positionProfileId,
      title: staffUnit.positionProfile.title,
      planned: 0,
      actual: 0,
    };
    entry.planned += staffUnit.plannedHeadcount;
    entry.actual += staffUnit.employments.length;
    rosterMap.set(staffUnit.positionProfileId, entry);
    frozenCount += staffUnit.employments.filter((e) => e.status === EmploymentStatus.FROZEN).length;
  }

  const roster = [...rosterMap.values()].sort((a, b) => a.title.localeCompare(b.title, "uk"));
  const totalStaff = roster.reduce((sum, r) => sum + r.actual, 0);

  return NextResponse.json({
    node: {
      id: node.id,
      name: node.name,
      type: node.type,
      path: node.path,
      code: node.code,
      parentId: node.parentId,
      address: node.address,
      sortOrder: node.sortOrder,
      isActive: node.isActive,
    },
    headFullName,
    totalStaff,
    frozenCount,
    roster,
  });
}
