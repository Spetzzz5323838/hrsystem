import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { canManagePermissions, getEffectiveGrants } from "../../../../lib/permissions";
import { resolveScopePaths } from "../../../../lib/access";

/**
 * "Симуляція" (docs catalogs-v1.1.md §4.5) — обрати працівника і побачити,
 * що саме він бачить і може, без перелогування під ним.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManagePermissions(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати права доступу" }, { status: 403 });
  }

  const personId = Number(request.nextUrl.searchParams.get("personId"));
  if (!Number.isInteger(personId)) return NextResponse.json({ error: "Потрібен personId" }, { status: 400 });

  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person) return NextResponse.json({ error: "Людину не знайдено" }, { status: 404 });

  const [scopePaths, grants] = await Promise.all([resolveScopePaths(personId), getEffectiveGrants(personId)]);
  return NextResponse.json({ fullName: person.fullName, scopePaths, grants });
}
