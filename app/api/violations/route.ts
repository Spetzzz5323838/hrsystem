import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { hasAccess } from "../../../lib/access";
import { getScopePaths } from "../../../lib/timesheet";
import { Capability, OrgNodeType, ViolationStatus } from "../../../generated/prisma/client";

/** Порушення магазинів в області CONDUCT_INSPECTION: усі незакриті й останні усунуті. */
export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getScopePaths(session.id, Capability.CONDUCT_INSPECTION);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до порушень" }, { status: 403 });

  const stores = await prisma.orgNode.findMany({ where: { type: OrgNodeType.OBJECT, isActive: true } });
  const storeIds = stores.filter((s) => scopePaths.some((p) => hasAccess(p, s.path))).map((s) => s.id);

  const include = {
    orgNode: true,
    area: { include: { areaType: true } },
    subjectEmployment: { include: { person: true } },
    takenBy: { include: { person: true } },
    result: { select: { id: true, photoPath: true } },
  } as const;
  const [active, resolved] = await Promise.all([
    prisma.violation.findMany({ where: { orgNodeId: { in: storeIds }, status: { not: ViolationStatus.RESOLVED } }, include, orderBy: { createdAt: "asc" } }),
    prisma.violation.findMany({ where: { orgNodeId: { in: storeIds }, status: ViolationStatus.RESOLVED }, include, orderBy: { resolvedAt: "desc" }, take: 10 }),
  ]);

  const map = (v: (typeof active)[number]) => ({
    id: v.id,
    inspectionId: v.inspectionId,
    resultId: v.result.id,
    hasPhoto: Boolean(v.result.photoPath),
    storeName: v.orgNode.name,
    where: v.area ? v.area.areaType.name : v.subjectEmployment ? v.subjectEmployment.person.fullName : "Загальний стан",
    text: v.text,
    comment: v.comment,
    status: v.status,
    createdAt: v.createdAt,
    takenBy: v.takenBy?.person.fullName ?? null,
  });
  return NextResponse.json({ active: active.map(map), resolved: resolved.map(map) });
}
