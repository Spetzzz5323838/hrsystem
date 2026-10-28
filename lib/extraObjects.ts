import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { createAssignment } from "./permissionMatrix";
import { EmploymentStatus, OrgNodeType, Role, ScopeType } from "../generated/prisma/client";

/**
 * "Додаткові об'єкти керування" (рішення власника 2026-10-28): адміністратор, що
 * відповідає за два й більше магазинів. Людина має ОДНУ основну посаду на основному
 * об'єкті, а за додатковими об'єктами отримує функціональну роль (RoleAssignment) —
 * завдяки цьому на додатковому об'єкті вона:
 *  - отримує ті самі задачі процесів (resolveAssignee бачить RoleAssignment);
 *  - має ті самі права, що й на основному (права ролі беруться зі спільних призначень
 *    PositionAccessAssignment для цієї ролі — вони створюються тут автоматично
 *    дзеркалом прав посади в межах "свій об'єкт").
 * Справжнє суміщення двох різних посад — окремий, пізніший етап.
 */
const SUPPORTED_ROLES: Role[] = [Role.STORE_ADMIN];

export async function getExtraObjects(employmentId: number) {
  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: { staffUnit: { include: { orgNode: true, positionProfile: true } }, roleAssignments: { include: { orgNode: true } } },
  });
  if (!employment) return null;

  const role = employment.staffUnit.positionProfile.systemRole;
  const eligible = !!role && SUPPORTED_ROLES.includes(role) && employment.status !== EmploymentStatus.TERMINATED;
  const items = employment.roleAssignments
    .filter((ra) => ra.role === role && ra.orgNodeId !== employment.staffUnit.orgNodeId)
    .map((ra) => ({ id: ra.id, orgNodeId: ra.orgNodeId, name: ra.orgNode.name }));

  const taken = new Set([employment.staffUnit.orgNodeId, ...items.map((i) => i.orgNodeId)]);
  const objects = eligible ? await prisma.orgNode.findMany({ where: { type: OrgNodeType.OBJECT, isActive: true }, orderBy: { name: "asc" } }) : [];
  return {
    eligible,
    mainObjectName: employment.staffUnit.orgNode.name,
    roleTitle: employment.staffUnit.positionProfile.title,
    items,
    options: objects.filter((o) => !taken.has(o.id)).map((o) => ({ id: o.id, name: o.name })),
  };
}

export async function addExtraObject(employmentId: number, orgNodeId: number, actorEmploymentId: number | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: { staffUnit: { include: { positionProfile: { include: { accessAssignments: true } } } } },
  });
  if (!employment || employment.status === EmploymentStatus.TERMINATED) return { ok: false, error: "Працівника не знайдено" };

  const role = employment.staffUnit.positionProfile.systemRole;
  if (!role || !SUPPORTED_ROLES.includes(role)) return { ok: false, error: "Додаткові об'єкти доступні лише для посад адміністратора магазину" };

  const node = await prisma.orgNode.findUnique({ where: { id: orgNodeId } });
  if (!node || node.type !== OrgNodeType.OBJECT || !node.isActive) return { ok: false, error: "Оберіть об'єкт (магазин, цех або склад)" };
  if (node.id === employment.staffUnit.orgNodeId) return { ok: false, error: "Це основний об'єкт працівника" };
  if (await prisma.roleAssignment.findUnique({ where: { employmentId_role_orgNodeId: { employmentId, role, orgNodeId } } })) {
    return { ok: false, error: "Цей об'єкт уже додано" };
  }

  // Права ролі = права посади в межах "свій об'єкт"/"свій відділ" (створюються один раз, далі спільні).
  for (const a of employment.staffUnit.positionProfile.accessAssignments) {
    if (a.scope === ScopeType.OWN_OBJECT || a.scope === ScopeType.OWN_DEPARTMENT) {
      await createAssignment({ role }, a.accessProfileId, a.scope, actorEmploymentId);
    }
  }

  await prisma.roleAssignment.create({ data: { employmentId, role, orgNodeId, createdById: actorEmploymentId } });
  await logAudit({ actorId: actorEmploymentId, action: "extraObject.added", entityType: "Employment", entityId: employmentId, diff: { orgNodeId, role } });
  return { ok: true };
}

export async function removeExtraObject(employmentId: number, roleAssignmentId: number, actorEmploymentId: number | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const ra = await prisma.roleAssignment.findUnique({ where: { id: roleAssignmentId } });
  if (!ra || ra.employmentId !== employmentId) return { ok: false, error: "Не знайдено" };
  await prisma.roleAssignment.delete({ where: { id: roleAssignmentId } });
  await logAudit({ actorId: actorEmploymentId, action: "extraObject.removed", entityType: "Employment", entityId: employmentId, diff: { orgNodeId: ra.orgNodeId, role: ra.role } });
  return { ok: true };
}
