import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { Capability, Role, ScopeType } from "../generated/prisma/client";

/**
 * Права доступу (docs catalogs-v1.1.md §4.5), 2026-09-14: замовник попросив
 * розділити дві осі замість однієї великої матриці "можливість × посада":
 *
 * 1. AccessProfile — профіль доступу, просто НАБІР можливостей (функцій),
 *    без області. Адмініструється тут ("Профілі доступу").
 * 2. PositionAccessAssignment — кому який профіль призначено і З ЯКОЮ
 *    областю (SELF/OWN_OBJECT/OWN_SUBTREE/...). Той самий профіль можна
 *    призначити різним посадам з різною областю (адмін магазину — по
 *    OWN_OBJECT, директор кластера — той самий профіль по OWN_SUBTREE) —
 *    без дублювання набору можливостей під двома назвами, як було раніше.
 *
 * `CUSTOM_NODE` тут навмисно не підтримується — docs §4.1 називає його
 * областю "для підмін і суміщення" конкретного працівника, не типовим
 * призначенням посади чи ролі; для нього лишається пряме редагування бази.
 */

export async function getAccessProfiles() {
  const profiles = await prisma.accessProfile.findMany({
    include: { capabilities: true },
    orderBy: { name: "asc" },
  });

  return {
    capabilities: Object.values(Capability),
    profiles: profiles.map((p) => ({
      id: p.id,
      name: p.name,
      capabilities: p.capabilities.map((c) => c.capability),
    })),
  };
}

export async function createAccessProfile(name: string, actorEmploymentId: number | null) {
  const profile = await prisma.accessProfile.create({ data: { name } });
  await logAudit({ actorId: actorEmploymentId, action: "accessProfile.created", entityType: "AccessProfile", entityId: profile.id, diff: { name } });
  return profile;
}

export async function renameAccessProfile(id: number, name: string, actorEmploymentId: number | null) {
  const profile = await prisma.accessProfile.update({ where: { id }, data: { name } });
  await logAudit({ actorId: actorEmploymentId, action: "accessProfile.renamed", entityType: "AccessProfile", entityId: id, diff: { name } });
  return profile;
}

export async function deleteAccessProfile(id: number, actorEmploymentId: number | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const inUse = await prisma.positionAccessAssignment.count({ where: { accessProfileId: id } });
  if (inUse > 0) {
    return { ok: false, error: `Профіль призначено ${inUse} раз(ів) — спершу зніміть призначення` };
  }
  await prisma.accessProfileCapability.deleteMany({ where: { accessProfileId: id } });
  await prisma.accessProfile.delete({ where: { id } });
  await logAudit({ actorId: actorEmploymentId, action: "accessProfile.deleted", entityType: "AccessProfile", entityId: id });
  return { ok: true };
}

export async function setProfileCapability(accessProfileId: number, capability: Capability, enabled: boolean, actorEmploymentId: number | null) {
  const existing = await prisma.accessProfileCapability.findFirst({ where: { accessProfileId, capability } });

  if (enabled && !existing) {
    await prisma.accessProfileCapability.create({ data: { accessProfileId, capability } });
  } else if (!enabled && existing) {
    await prisma.accessProfileCapability.delete({ where: { id: existing.id } });
  } else {
    return; // без реальної зміни
  }

  await logAudit({
    actorId: actorEmploymentId,
    action: "accessProfile.capabilityChanged",
    entityType: "AccessProfile",
    entityId: accessProfileId,
    diff: { capability, enabled },
  });
}

export async function getAccessAssignments() {
  const [positionProfiles, assignments, profiles] = await Promise.all([
    prisma.positionProfile.findMany({
      where: { isActive: true },
      select: { id: true, title: true, level: true },
      orderBy: [{ level: "desc" }, { title: "asc" }],
    }),
    prisma.positionAccessAssignment.findMany({ where: { customNodeId: null } }),
    prisma.accessProfile.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return {
    positionProfiles,
    roles: Object.values(Role),
    profiles,
    assignments: assignments.map((a) => ({
      id: a.id,
      positionProfileId: a.positionProfileId,
      role: a.role,
      accessProfileId: a.accessProfileId,
      scope: a.scope,
    })),
  };
}

export async function createAssignment(
  target: { positionProfileId?: number; role?: Role },
  accessProfileId: number,
  scope: ScopeType,
  actorEmploymentId: number | null,
) {
  const existing = await prisma.positionAccessAssignment.findFirst({
    where: { ...target, accessProfileId, scope, customNodeId: null },
  });
  if (existing) return existing;

  const created = await prisma.positionAccessAssignment.create({ data: { ...target, accessProfileId, scope } });
  await logAudit({
    actorId: actorEmploymentId,
    action: "accessAssignment.created",
    entityType: "PositionAccessAssignment",
    entityId: created.id,
    diff: { target, accessProfileId, scope },
  });
  return created;
}

export async function deleteAssignment(id: number, actorEmploymentId: number | null) {
  const existing = await prisma.positionAccessAssignment.findUnique({ where: { id } });
  if (!existing) return;
  await prisma.positionAccessAssignment.delete({ where: { id } });
  await logAudit({
    actorId: actorEmploymentId,
    action: "accessAssignment.deleted",
    entityType: "PositionAccessAssignment",
    entityId: id,
    diff: { positionProfileId: existing.positionProfileId, role: existing.role, accessProfileId: existing.accessProfileId, scope: existing.scope },
  });
}
