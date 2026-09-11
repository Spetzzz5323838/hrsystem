import { prisma } from "./prisma";
import { hasAccess } from "./access";
import { Capability, ScopeType, OrgNodeType, EmploymentStatus } from "../generated/prisma/client";

export type EffectiveGrant = {
  capability: Capability;
  scope: ScopeType;
  /** Вузол-область для scope, що прив'язаний до дерева. null для SELF/SUBORDINATES — вони не про вузол. */
  scopePath: string | null;
};

export async function findAncestorPath(path: string, type: OrgNodeType): Promise<string | null> {
  const ids = path.split(".").map(Number);
  const ancestors = await prisma.orgNode.findMany({ where: { id: { in: ids } } });
  const byId = new Map(ancestors.map((a) => [a.id, a]));

  for (let i = ids.length - 1; i >= 0; i--) {
    const candidate = byId.get(ids[i]);
    if (candidate?.type === type) return candidate.path;
  }
  return null;
}

async function companyRootPath(): Promise<string | null> {
  const root = await prisma.orgNode.findFirst({ where: { type: OrgNodeType.COMPANY } });
  return root?.path ?? null;
}

async function resolveNodeScope(scope: ScopeType, staffNodePath: string, customNodeId: number | null): Promise<string | null> {
  switch (scope) {
    case ScopeType.COMPANY:
      return companyRootPath();
    case ScopeType.CUSTOM_NODE: {
      if (!customNodeId) return null;
      const node = await prisma.orgNode.findUnique({ where: { id: customNodeId } });
      return node?.path ?? null;
    }
    case ScopeType.OWN_SUBTREE:
      return staffNodePath;
    case ScopeType.OWN_OBJECT:
      return findAncestorPath(staffNodePath, OrgNodeType.OBJECT);
    case ScopeType.OWN_DEPARTMENT:
      return findAncestorPath(staffNodePath, OrgNodeType.DEPARTMENT);
    case ScopeType.SELF:
    case ScopeType.SUBORDINATES:
      return null;
  }
}

/**
 * Ефективні права людини зараз: об'єднання грантів від профілю посади
 * (по всіх чинних Employment) і від функціональних ролей (RoleAssignment).
 * Кожен грант — з уже розрахованим вузлом-областю, де це має сенс.
 */
export async function getEffectiveGrants(personId: number): Promise<EffectiveGrant[]> {
  const employments = await prisma.employment.findMany({
    where: { personId, status: { not: EmploymentStatus.TERMINATED } },
    include: {
      staffUnit: {
        include: {
          orgNode: true,
          positionProfile: { include: { permissionGrants: true } },
        },
      },
      roleAssignments: { include: { orgNode: true } },
    },
  });

  const grants: EffectiveGrant[] = [];

  for (const employment of employments) {
    const staffNodePath = employment.staffUnit.orgNode.path;

    for (const grant of employment.staffUnit.positionProfile.permissionGrants) {
      grants.push({
        capability: grant.capability,
        scope: grant.scope,
        scopePath: await resolveNodeScope(grant.scope, staffNodePath, grant.customNodeId),
      });
    }

    for (const roleAssignment of employment.roleAssignments) {
      const roleGrants = await prisma.permissionGrant.findMany({ where: { role: roleAssignment.role } });
      for (const grant of roleGrants) {
        grants.push({
          capability: grant.capability,
          scope: grant.scope,
          scopePath: await resolveNodeScope(grant.scope, roleAssignment.orgNode.path, grant.customNodeId),
        });
      }
    }
  }

  return grants;
}

/** Чи є в managerPersonId (прямий чи транзитивний) підлеглий targetPersonId, за ланцюжком Employment.managerId. */
async function isSubordinate(managerPersonId: number, targetPersonId: number): Promise<boolean> {
  const managerEmployments = await prisma.employment.findMany({
    where: { personId: managerPersonId },
    select: { id: true },
  });
  const managerEmploymentIds = new Set(managerEmployments.map((e) => e.id));

  let current = await prisma.employment.findFirst({
    where: { personId: targetPersonId, status: { not: EmploymentStatus.TERMINATED } },
    select: { managerId: true },
  });

  const visited = new Set<number>();
  while (current?.managerId) {
    if (managerEmploymentIds.has(current.managerId)) return true;
    if (visited.has(current.managerId)) break; // захист від циклу в даних
    visited.add(current.managerId);
    current = await prisma.employment.findUnique({ where: { id: current.managerId }, select: { managerId: true } });
  }
  return false;
}

/**
 * Перевірка можливості. `target.personId` потрібен для SELF/SUBORDINATES,
 * `target.orgNodePath` — для решти областей (правило hasAccess).
 */
export async function can(
  personId: number,
  capability: Capability,
  target: { personId?: number; orgNodePath?: string },
): Promise<boolean> {
  const grants = await getEffectiveGrants(personId);

  for (const grant of grants) {
    if (grant.capability !== capability) continue;

    if (grant.scope === ScopeType.SELF) {
      if (target.personId === personId) return true;
      continue;
    }

    if (grant.scope === ScopeType.SUBORDINATES) {
      if (target.personId && (await isSubordinate(personId, target.personId))) return true;
      continue;
    }

    if (grant.scopePath && target.orgNodePath && hasAccess(grant.scopePath, target.orgNodePath)) {
      return true;
    }
  }

  return false;
}
