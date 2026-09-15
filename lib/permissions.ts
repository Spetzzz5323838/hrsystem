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

/** Найближчий по дереву вгору вузол із призначеним керівником (headEmploymentId). */
export async function findNearestHead(path: string): Promise<number | null> {
  const ids = path.split(".").map(Number);
  const ancestors = await prisma.orgNode.findMany({ where: { id: { in: ids } } });
  const byId = new Map(ancestors.map((a) => [a.id, a]));

  for (let i = ids.length - 1; i >= 0; i--) {
    const candidate = byId.get(ids[i]);
    if (candidate?.headEmploymentId) return candidate.headEmploymentId;
  }
  return null;
}

export async function companyRootPath(): Promise<string | null> {
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
 * Ефективні права людини зараз: об'єднання призначень профілів доступу —
 * від профілю посади (по всіх чинних Employment) і від функціональних
 * ролей (RoleAssignment). Профіль (AccessProfile) — набір можливостей без
 * області; область задає саме призначення (PositionAccessAssignment).
 * Один профіль може бути призначений кільком посадам з РІЗНОЮ областю
 * (напр. "Повне управління персоналом" — адміну магазину по OWN_OBJECT,
 * директору кластера по OWN_SUBTREE) — звідси й economy порівняно зі
 * старою моделлю, де довелось би дублювати сам список можливостей.
 */
export async function getEffectiveGrants(personId: number): Promise<EffectiveGrant[]> {
  const employments = await prisma.employment.findMany({
    where: { personId, status: { not: EmploymentStatus.TERMINATED } },
    include: {
      staffUnit: {
        include: {
          orgNode: true,
          positionProfile: {
            include: { accessAssignments: { include: { accessProfile: { include: { capabilities: true } } } } },
          },
        },
      },
      roleAssignments: { include: { orgNode: true } },
    },
  });

  const grants: EffectiveGrant[] = [];

  for (const employment of employments) {
    const staffNodePath = employment.staffUnit.orgNode.path;

    for (const assignment of employment.staffUnit.positionProfile.accessAssignments) {
      const scopePath = await resolveNodeScope(assignment.scope, staffNodePath, assignment.customNodeId);
      for (const cap of assignment.accessProfile.capabilities) {
        grants.push({ capability: cap.capability, scope: assignment.scope, scopePath });
      }
    }

    for (const roleAssignment of employment.roleAssignments) {
      const roleAccessAssignments = await prisma.positionAccessAssignment.findMany({
        where: { role: roleAssignment.role },
        include: { accessProfile: { include: { capabilities: true } } },
      });
      for (const assignment of roleAccessAssignments) {
        const scopePath = await resolveNodeScope(assignment.scope, roleAssignment.orgNode.path, assignment.customNodeId);
        for (const cap of assignment.accessProfile.capabilities) {
          grants.push({ capability: cap.capability, scope: assignment.scope, scopePath });
        }
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

/**
 * Компетенції/матеріали/зв'язок посада-компетенція — глобальні довідники
 * (без orgNodeId), тому редагувати їх може лише той, чий MANAGE_MATERIALS
 * покриває весь COMPANY-корінь. Докс дає "Адміністратор магазину"
 * MANAGE_MATERIALS зі scope OWN_OBJECT — але per-об'єктного накладання на
 * ці глобальні довідники в моделі ще нема, тож такий грант тут навмисно
 * не спрацьовує (hasAccess(objectPath, companyRootPath) завжди false).
 */
export async function canManageCatalog(personId: number): Promise<boolean> {
  const root = await companyRootPath();
  if (!root) return false;
  return can(personId, Capability.MANAGE_MATERIALS, { orgNodePath: root });
}

/** Конструктор чек-листів і атестації (docs: "SYSADMIN створює й редагує без розробника") — MANAGE_TEMPLATES, COMPANY-скоуп. */
export async function canManageTemplates(personId: number): Promise<boolean> {
  const root = await companyRootPath();
  if (!root) return false;
  return can(personId, Capability.MANAGE_TEMPLATES, { orgNodePath: root });
}

/** Редагування дерева оргструктури (docs plan-v1.md §15) — MANAGE_ORG_STRUCTURE, COMPANY-скоуп. */
export async function canManageOrgStructure(personId: number): Promise<boolean> {
  const root = await companyRootPath();
  if (!root) return false;
  return can(personId, Capability.MANAGE_ORG_STRUCTURE, { orgNodePath: root });
}

/** Екран "Права доступу" (docs catalogs-v1.1.md §4.5) — MANAGE_PERMISSIONS, COMPANY-скоуп. */
export async function canManagePermissions(personId: number): Promise<boolean> {
  const root = await companyRootPath();
  if (!root) return false;
  return can(personId, Capability.MANAGE_PERMISSIONS, { orgNodePath: root });
}
