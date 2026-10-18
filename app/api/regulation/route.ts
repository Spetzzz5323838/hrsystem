import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { getScopePaths } from "../../../lib/timesheet";
import { getCurrentRegulation, normalizeItems, saveRegulation } from "../../../lib/inspections";
import { Capability, EmploymentStatus } from "../../../generated/prisma/client";

/** Регламент обходів: поточна версія (або ?version=N), історія версій, довідники для форми. Редагує лише MANAGE_REGULATION. */
export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const [reg, sched, areas] = await Promise.all([
    getScopePaths(session.id, Capability.MANAGE_REGULATION),
    getScopePaths(session.id, Capability.MANAGE_INSPECTION_SCHEDULE),
    getScopePaths(session.id, Capability.MANAGE_AREAS),
  ]);
  if (!reg.length && !sched.length && !areas.length) return NextResponse.json({ error: "Немає доступу до регламенту" }, { status: 403 });

  const wanted = Number(request.nextUrl.searchParams.get("version"));
  const current = await getCurrentRegulation();
  const shown = Number.isInteger(wanted) && wanted > 0 && wanted !== current?.version
    ? await prisma.regulationVersion.findUnique({ where: { version: wanted }, include: { createdBy: { include: { person: true } }, items: { orderBy: { sortOrder: "asc" } } } })
    : current;

  const [versions, areaTypes, positions] = await Promise.all([
    prisma.regulationVersion.findMany({ orderBy: { version: "desc" }, include: { createdBy: { include: { person: true } }, _count: { select: { items: true } } } }),
    prisma.areaType.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.positionProfile.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);

  return NextResponse.json({
    canEdit: reg.length > 0,
    currentVersion: current?.version ?? null,
    shown: shown && {
      version: shown.version,
      isCurrent: shown.isCurrent,
      note: shown.note,
      createdAt: shown.createdAt,
      items: shown.items.map((i) => ({ text: i.text, target: i.target, areaTypeId: i.areaTypeId, positionProfileId: i.positionProfileId, inDaily: i.inDaily })),
    },
    versions: versions.map((v) => ({ version: v.version, isCurrent: v.isCurrent, note: v.note, createdAt: v.createdAt, author: v.createdBy?.person.fullName ?? null, itemCount: v._count.items })),
    areaTypes: areaTypes.map((t) => ({ id: t.id, name: t.name })),
    positions,
  });
}

/** Зберігає регламент як нову версію: { items: [...], note }. */
export async function PUT(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await getScopePaths(session.id, Capability.MANAGE_REGULATION)).length) return NextResponse.json({ error: "Немає права змінювати регламент" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const normalized = await normalizeItems(body?.items);
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  const result = await saveRegulation(normalized.items, typeof body?.note === "string" ? body.note : null, actor?.id ?? null);
  return NextResponse.json(result);
}
