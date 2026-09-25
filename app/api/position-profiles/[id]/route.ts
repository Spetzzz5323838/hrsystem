import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { canManageCatalog } from "../../../../lib/permissions";
import { logAudit } from "../../../../lib/audit";
import { recomputeModuleFlags, TITLE_BASED_MODULES } from "../../../../lib/positionProfile";
import { ChecklistModule, EmploymentStatus, Role } from "../../../../generated/prisma/client";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const person = await getSessionPerson();
  if (!person) {
    return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  }

  const { id } = await params;
  const profileId = Number(id);
  if (!Number.isInteger(profileId)) {
    return NextResponse.json({ error: "Невірний id профілю" }, { status: 400 });
  }

  const profile = await prisma.positionProfile.findUnique({
    where: { id: profileId },
    include: {
      positionCompetencies: {
        include: {
          competency: { include: { materials: { select: { id: true, title: true } } } },
        },
      },
    },
  });

  if (!profile) {
    return NextResponse.json({ error: "Профіль не знайдено" }, { status: 404 });
  }

  return NextResponse.json({
    id: profile.id,
    title: profile.title,
    level: profile.level,
    canBeCurator: profile.canBeCurator,
    requiresCashierAccount: profile.requiresCashierAccount,
    isMateriallyLiable: profile.isMateriallyLiable,
    isFoodHandling: profile.isFoodHandling,
    systemRole: profile.systemRole,
    moduleFlags: profile.moduleFlags,
    isActive: profile.isActive,
    competencies: profile.positionCompetencies.map((pc) => ({
      id: pc.competency.id,
      name: pc.competency.name,
      validMonths: pc.competency.validMonths,
      resetOnBreakMonths: pc.competency.resetOnBreakMonths,
      materials: pc.competency.materials,
      isRequired: pc.isRequired,
    })),
  });
}

/**
 * Редагування наявної посади (правки 20.09.2026, п.10) — той самий гейт,
 * що й створення. moduleFlags перераховується від прапорців/рівня щоразу
 * (той самий принцип, що upsert у prisma/seed.ts), title-модулі без
 * власного прапорця (RETAIL/WAREHOUSE/TRANSPORT/SECURITY/OFFICE) —
 * окремим полем extraModules, якщо передано, інакше лишаються як були.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const person = await getSessionPerson();
  if (!person) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageCatalog(person.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати довідник посад" }, { status: 403 });

  const { id } = await params;
  const profileId = Number(id);
  if (!Number.isInteger(profileId)) return NextResponse.json({ error: "Невірний id профілю" }, { status: 400 });

  const current = await prisma.positionProfile.findUnique({ where: { id: profileId } });
  if (!current) return NextResponse.json({ error: "Профіль не знайдено" }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Порожнє тіло запиту" }, { status: 400 });

  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  if (title === "") return NextResponse.json({ error: "Назва не може бути порожньою" }, { status: 400 });

  const level = body.level !== undefined ? Number(body.level) : current.level;
  if (!Number.isInteger(level) || level < 0) return NextResponse.json({ error: "Невірний рівень" }, { status: 400 });

  let systemRole: Role | null | undefined;
  if (body.systemRole !== undefined) {
    systemRole = body.systemRole ? body.systemRole : null;
    if (systemRole && !Object.values(Role).includes(systemRole)) {
      return NextResponse.json({ error: "Невірна функціональна роль" }, { status: 400 });
    }
  }

  const flags = {
    canBeCurator: body.canBeCurator !== undefined ? Boolean(body.canBeCurator) : current.canBeCurator,
    requiresCashierAccount: body.requiresCashierAccount !== undefined ? Boolean(body.requiresCashierAccount) : current.requiresCashierAccount,
    isMateriallyLiable: body.isMateriallyLiable !== undefined ? Boolean(body.isMateriallyLiable) : current.isMateriallyLiable,
    isFoodHandling: body.isFoodHandling !== undefined ? Boolean(body.isFoodHandling) : current.isFoodHandling,
  };
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;

  const baseModules: ChecklistModule[] = Array.isArray(body.extraModules)
    ? body.extraModules.filter((m: string) => (TITLE_BASED_MODULES as readonly string[]).includes(m))
    : current.moduleFlags;
  const moduleFlags = recomputeModuleFlags(baseModules, { ...flags, level });

  const profile = await prisma.positionProfile.update({
    where: { id: profileId },
    data: { title, level, systemRole, moduleFlags, isActive, ...flags },
  });

  const actor = await prisma.employment.findFirst({ where: { personId: person.id, status: { not: EmploymentStatus.TERMINATED } } });
  await logAudit({ actorId: actor?.id ?? null, action: "positionProfile.updated", entityType: "PositionProfile", entityId: profile.id });

  return NextResponse.json({ ok: true });
}
