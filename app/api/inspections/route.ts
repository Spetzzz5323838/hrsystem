import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { hasAccess } from "../../../lib/access";
import { getScopePaths } from "../../../lib/timesheet";
import { Capability, InspectionStatus, OrgNodeType } from "../../../generated/prisma/client";

/** Обходи магазинів в області CONDUCT_INSPECTION: відкриті (заплановані/ті, що йдуть) і останні завершені. */
export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getScopePaths(session.id, Capability.CONDUCT_INSPECTION);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає права проводити обходи" }, { status: 403 });

  const stores = await prisma.orgNode.findMany({ where: { type: OrgNodeType.OBJECT, isActive: true } });
  const storeIds = stores.filter((s) => scopePaths.some((p) => hasAccess(p, s.path))).map((s) => s.id);

  const [open, done] = await Promise.all([
    prisma.inspection.findMany({
      where: { orgNodeId: { in: storeIds }, status: { in: [InspectionStatus.PLANNED, InspectionStatus.IN_PROGRESS] } },
      include: { orgNode: true, conductedBy: { include: { person: true } } },
      orderBy: { plannedFor: "asc" },
    }),
    prisma.inspection.findMany({
      where: { orgNodeId: { in: storeIds }, status: InspectionStatus.COMPLETED },
      include: { orgNode: true, conductedBy: { include: { person: true } }, results: { select: { rating: true } } },
      orderBy: { completedAt: "desc" },
      take: 15,
    }),
  ]);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return NextResponse.json({
    open: open.map((i) => ({
      id: i.id,
      storeName: i.orgNode.name,
      kind: i.kind,
      status: i.status,
      plannedFor: i.plannedFor,
      postponedCount: i.postponedCount,
      canStart: i.plannedFor.getTime() <= endOfToday.getTime(),
      conductedBy: i.conductedBy?.person.fullName ?? null,
    })),
    done: done.map((i) => ({
      id: i.id,
      storeName: i.orgNode.name,
      kind: i.kind,
      completedAt: i.completedAt,
      conductedBy: i.conductedBy?.person.fullName ?? null,
      green: i.results.filter((r) => r.rating === "GREEN").length,
      yellow: i.results.filter((r) => r.rating === "YELLOW").length,
      red: i.results.filter((r) => r.rating === "RED").length,
    })),
  });
}
