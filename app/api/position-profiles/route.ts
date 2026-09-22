import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { canManageCatalog } from "../../../lib/permissions";
import { logAudit } from "../../../lib/audit";
import { recomputeModuleFlags, TITLE_BASED_MODULES } from "../../../lib/positionProfile";
import { ChecklistModule, EmploymentStatus, Role } from "../../../generated/prisma/client";

export async function GET() {
  const person = await getSessionPerson();
  if (!person) {
    return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  }

  const profiles = await prisma.positionProfile.findMany({
    orderBy: [{ level: "desc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      level: true,
      canBeCurator: true,
      requiresCashierAccount: true,
      isMateriallyLiable: true,
      isFoodHandling: true,
      systemRole: true,
    },
  });

  return NextResponse.json(profiles);
}

/**
 * Створення нової посади в довіднику (правки 20.09.2026, п.10 — раніше
 * можна було лише переглядати наявні 31). Гейт — той самий, що й для
 * компетенцій/матеріалів (canManageCatalog, MANAGE_MATERIALS COMPANY-скоуп).
 */
export async function POST(request: NextRequest) {
  const person = await getSessionPerson();
  if (!person) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageCatalog(person.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати довідник посад" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const level = Number(body?.level);
  if (!title) return NextResponse.json({ error: "Потрібна назва посади" }, { status: 400 });
  if (!Number.isInteger(level) || level < 0) return NextResponse.json({ error: "Невірний рівень" }, { status: 400 });

  const systemRole = typeof body?.systemRole === "string" && body.systemRole ? body.systemRole : null;
  if (systemRole && !Object.values(Role).includes(systemRole as Role)) {
    return NextResponse.json({ error: "Невірна функціональна роль" }, { status: 400 });
  }

  const flags = {
    canBeCurator: Boolean(body?.canBeCurator),
    requiresCashierAccount: Boolean(body?.requiresCashierAccount),
    isMateriallyLiable: Boolean(body?.isMateriallyLiable),
    isFoodHandling: Boolean(body?.isFoodHandling),
  };
  const extraModules: ChecklistModule[] = Array.isArray(body?.extraModules)
    ? body.extraModules.filter((m: string) => (TITLE_BASED_MODULES as readonly string[]).includes(m))
    : [];
  const moduleFlags = recomputeModuleFlags(extraModules, { ...flags, level });

  const existing = await prisma.positionProfile.findUnique({ where: { title } });
  if (existing) return NextResponse.json({ error: "Посада з такою назвою вже є в довіднику" }, { status: 409 });

  const profile = await prisma.positionProfile.create({
    data: { title, level, systemRole: systemRole as Role | null, moduleFlags, ...flags },
  });

  const actor = await prisma.employment.findFirst({ where: { personId: person.id, status: { not: EmploymentStatus.TERMINATED } } });
  await logAudit({ actorId: actor?.id ?? null, action: "positionProfile.created", entityType: "PositionProfile", entityId: profile.id, diff: { title, level } });

  return NextResponse.json({ id: profile.id });
}
