import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { hasAccess } from "../../../lib/access";
import { getScopePaths, getTimesheet } from "../../../lib/timesheet";
import { Capability, OrgNodeType } from "../../../generated/prisma/client";

/** Табель за місяць: ?month=2026-10&objectId=5 (магазин необов'язковий). */
export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getScopePaths(session.id, Capability.VIEW_TIMESHEET);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до табеля" }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const match = /^(\d{4})-(\d{2})$/.exec(params.get("month") ?? "");
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) - 1 : now.getMonth();
  if (month < 0 || month > 11) return NextResponse.json({ error: "Невірний місяць" }, { status: 400 });
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 1);

  const objectIdParam = params.get("objectId");
  const objectId = objectIdParam ? Number(objectIdParam) : null;

  const [employees, objects, editScopes] = await Promise.all([
    getTimesheet(scopePaths, from, to, objectId),
    prisma.orgNode.findMany({ where: { type: OrgNodeType.OBJECT, isActive: true }, orderBy: { name: "asc" } }),
    getScopePaths(session.id, Capability.EDIT_SHIFTS),
  ]);

  return NextResponse.json({
    month: `${year}-${String(month + 1).padStart(2, "0")}`,
    objects: objects.filter((o) => scopePaths.some((p) => hasAccess(p, o.path))).map((o) => ({ id: o.id, name: o.name, canEdit: editScopes.some((p) => hasAccess(p, o.path)) })),
    employees,
  });
}
