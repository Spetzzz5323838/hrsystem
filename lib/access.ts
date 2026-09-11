import { prisma } from "./prisma";
import { EmploymentStatus } from "../generated/prisma/client";

/**
 * Правило перевірки доступу з CLAUDE.md: область дії — це вузол дерева,
 * і доступ поширюється на все піддерево під ним.
 */
export function hasAccess(scopePath: string, targetPath: string): boolean {
  return targetPath === scopePath || targetPath.startsWith(`${scopePath}.`);
}

export function canAccessNode(scopePaths: string[], targetPath: string): boolean {
  return scopePaths.some((scopePath) => hasAccess(scopePath, targetPath));
}

/**
 * Область(і) доступу людини зараз: власний вузол (StaffUnit) кожного
 * чинного працевлаштування + вузли з її функціональних ролей (RoleAssignment).
 *
 * Обмеження: повний розрахунок області за рівнем посади (OWN_OBJECT,
 * OWN_SUBTREE тощо з PositionProfile.level) тут не рахується — це окремий
 * крок (матриця PermissionGrant + симулятор прав). Без нього, наприклад,
 * адміністратор магазину отримує тут доступ лише до власного вузла
 * StaffUnit, а не до всього об'єкта.
 */
export async function resolveScopePaths(personId: number): Promise<string[]> {
  const employments = await prisma.employment.findMany({
    where: { personId, status: { not: EmploymentStatus.TERMINATED } },
    include: {
      staffUnit: { include: { orgNode: true } },
      roleAssignments: { include: { orgNode: true } },
    },
  });

  const paths = new Set<string>();
  for (const employment of employments) {
    paths.add(employment.staffUnit.orgNode.path);
    for (const roleAssignment of employment.roleAssignments) {
      paths.add(roleAssignment.orgNode.path);
    }
  }
  return [...paths];
}
