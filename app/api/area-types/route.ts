import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { logAudit } from "../../../lib/audit";
import { getScopePaths } from "../../../lib/timesheet";
import { Capability, EmploymentStatus } from "../../../generated/prisma/client";

/** Довідник типів ділянок: бачать усі, хто керує ділянками; змінюють — лише MANAGE_AREA_TYPES. */
export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const [manageAreas, manageTypes] = await Promise.all([getScopePaths(session.id, Capability.MANAGE_AREAS), getScopePaths(session.id, Capability.MANAGE_AREA_TYPES)]);
  if (!manageAreas.length && !manageTypes.length) return NextResponse.json({ error: "Немає доступу до ділянок" }, { status: 403 });

  const types = await prisma.areaType.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  return NextResponse.json({ canEdit: manageTypes.length > 0, types });
}

export async function POST(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await getScopePaths(session.id, Capability.MANAGE_AREA_TYPES)).length) return NextResponse.json({ error: "Немає права змінювати типи ділянок" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Вкажіть назву типу ділянки" }, { status: 400 });
  if (await prisma.areaType.findUnique({ where: { name } })) return NextResponse.json({ error: "Тип з такою назвою вже є" }, { status: 409 });

  const isGeneral = body?.isGeneral === true;
  const last = await prisma.areaType.findFirst({ orderBy: { sortOrder: "desc" } });
  const created = await prisma.areaType.create({
    data: { name, isGeneral, requiresStaff: isGeneral ? false : body?.requiresStaff !== false, sortOrder: (last?.sortOrder ?? 0) + 10 },
  });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  await logAudit({ actorId: actor?.id ?? null, action: "areaType.created", entityType: "AreaType", entityId: created.id, diff: { name } });
  return NextResponse.json({ id: created.id });
}
