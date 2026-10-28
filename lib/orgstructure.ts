import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { EmploymentStatus, OrgNodeType } from "../generated/prisma/client";

export type OrgNodeInput = {
  type: OrgNodeType;
  name: string;
  code?: string | null;
  parentId: number | null;
  address?: string | null;
  sortOrder?: number;
};

/** Ідентифікатори вузла й усього його піддерева (сам вузол + нащадки за `path`). */
async function subtreeIds(nodeId: number): Promise<number[]> {
  const node = await prisma.orgNode.findUniqueOrThrow({ where: { id: nodeId } });
  const rows = await prisma.orgNode.findMany({
    where: { OR: [{ id: node.id }, { path: { startsWith: `${node.path}.` } }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Чи є в піддереві хоч один НЕ звільнений працівник (docs plan-v1.md §5.5.4). */
async function subtreeHasActiveEmployees(nodeId: number): Promise<boolean> {
  const ids = await subtreeIds(nodeId);
  const count = await prisma.employment.count({
    where: { status: { not: EmploymentStatus.TERMINATED }, staffUnit: { orgNodeId: { in: ids } } },
  });
  return count > 0;
}

/**
 * Створення вузла (docs plan-v1.md §5.5). `path` будується так само, як у
 * seed-скрипті: спершу створюємо з заглушкою, тоді дописуємо реальний path
 * на основі власного щойно виданого id — інакше id наперед невідомий.
 */
/**
 * Де який рівень може стояти (щоб не створити кластер усередині відділу тощо).
 * Кластер/напрям — у компанії або в іншому напрямі; об'єкт (магазин, цех, склад) —
 * у напрямі чи в компанії; відділ — в об'єкті, напрямі або іншому відділі.
 */
export const ALLOWED_PARENT_TYPES: Record<string, OrgNodeType[]> = {
  DIVISION: [OrgNodeType.COMPANY, OrgNodeType.DIVISION],
  OBJECT: [OrgNodeType.COMPANY, OrgNodeType.DIVISION],
  DEPARTMENT: [OrgNodeType.DIVISION, OrgNodeType.OBJECT, OrgNodeType.DEPARTMENT],
};

const TYPE_NAME: Record<string, string> = { COMPANY: "компанії", DIVISION: "кластері/напрямі", OBJECT: "об'єкті", DEPARTMENT: "відділі" };

export async function createOrgNode(input: OrgNodeInput, actorEmploymentId: number | null) {
  const parent = input.parentId ? await prisma.orgNode.findUnique({ where: { id: input.parentId } }) : null;
  if (input.parentId && !parent) return { ok: false as const, error: "Батьківський вузол не знайдено" };
  const allowedParents = ALLOWED_PARENT_TYPES[input.type];
  if (!allowedParents) return { ok: false as const, error: "Цей рівень створити не можна" };
  if (!parent || !allowedParents.includes(parent.type)) {
    const where = allowedParents.map((t) => TYPE_NAME[t]).join(", ");
    return { ok: false as const, error: `Цей рівень можна створювати лише в: ${where}. Оберіть інший батьківський вузол.` };
  }

  const created = await prisma.orgNode.create({
    data: {
      type: input.type,
      name: input.name,
      code: input.code || null,
      parentId: input.parentId,
      address: input.address || null,
      sortOrder: input.sortOrder ?? 0,
      path: "0",
    },
  });

  const path = parent ? `${parent.path}.${created.id}` : `${created.id}`;
  const node = await prisma.orgNode.update({ where: { id: created.id }, data: { path } });

  await logAudit({ actorId: actorEmploymentId, action: "orgNode.created", entityType: "OrgNode", entityId: node.id, diff: input });
  return { ok: true as const, node };
}

export async function updateOrgNode(
  nodeId: number,
  input: { name?: string; code?: string | null; address?: string | null; sortOrder?: number; isActive?: boolean },
  actorEmploymentId: number | null,
) {
  const existing = await prisma.orgNode.findUnique({ where: { id: nodeId } });
  if (!existing) return { ok: false as const, error: "Вузол не знайдено" };

  if (input.isActive === false && existing.isActive) {
    if (await subtreeHasActiveEmployees(nodeId)) {
      return { ok: false as const, error: "Не можна архівувати вузол — у ньому чи в піддереві є непрозвільнені працівники" };
    }
  }

  const node = await prisma.orgNode.update({
    where: { id: nodeId },
    data: {
      name: input.name,
      code: input.code === undefined ? undefined : input.code || null,
      address: input.address === undefined ? undefined : input.address || null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });

  await logAudit({ actorId: actorEmploymentId, action: "orgNode.updated", entityType: "OrgNode", entityId: node.id, diff: input });
  return { ok: true as const, node };
}

/**
 * Переміщення вузла в іншого батька — перерахунок `path` для самого вузла
 * і всього піддерева в одній транзакції (docs plan-v1.md §5.5.2).
 */
export async function moveOrgNode(nodeId: number, newParentId: number, actorEmploymentId: number | null) {
  const [node, newParent] = await Promise.all([
    prisma.orgNode.findUnique({ where: { id: nodeId } }),
    prisma.orgNode.findUnique({ where: { id: newParentId } }),
  ]);
  if (!node) return { ok: false as const, error: "Вузол не знайдено" };
  if (!newParent) return { ok: false as const, error: "Новий батьківський вузол не знайдено" };
  if (newParent.id === node.id) return { ok: false as const, error: "Вузол не можна перемістити сам у себе" };
  if (newParent.path === node.path || newParent.path.startsWith(`${node.path}.`)) {
    return { ok: false as const, error: "Не можна перемістити вузол у власне піддерево" };
  }

  const oldPath = node.path;
  const newPath = `${newParent.path}.${node.id}`;

  const descendants = await prisma.orgNode.findMany({
    where: { path: { startsWith: `${oldPath}.` } },
    select: { id: true, path: true },
  });

  await prisma.$transaction([
    prisma.orgNode.update({ where: { id: node.id }, data: { parentId: newParent.id, path: newPath } }),
    ...descendants.map((d) =>
      prisma.orgNode.update({ where: { id: d.id }, data: { path: newPath + d.path.slice(oldPath.length) } }),
    ),
  ]);

  await logAudit({
    actorId: actorEmploymentId,
    action: "orgNode.moved",
    entityType: "OrgNode",
    entityId: node.id,
    diff: { fromParentId: node.parentId, toParentId: newParent.id, oldPath, newPath, descendantsMoved: descendants.length },
  });
  return { ok: true as const };
}

/**
 * «Створити об'єкт за шаблоном» (docs plan-v1.md §5.5.1) — копіює прямі
 * DEPARTMENT-нащадки й штатний розпис (StaffUnit) вихідного OBJECT одним
 * кліком. Свідоме спрощення: клонує лише один рівень углиб (OBJECT →
 * DEPARTMENT) — глибша вкладеність у поточній структурі не зустрічається.
 * Код відділів не копіюється (лишається null) — щоб не зіткнутися з
 * унікальністю `OrgNode.code`, самі коди для магазинів не обов'язкові.
 */
export async function createOrgNodeFromTemplate(
  input: { sourceObjectId: number; targetParentId: number; name: string; code?: string | null },
  actorEmploymentId: number | null,
) {
  const source = await prisma.orgNode.findUnique({ where: { id: input.sourceObjectId } });
  if (!source || source.type !== OrgNodeType.OBJECT) {
    return { ok: false as const, error: "Вихідний об'єкт-шаблон не знайдено" };
  }
  const targetParent = await prisma.orgNode.findUnique({ where: { id: input.targetParentId } });
  if (!targetParent) return { ok: false as const, error: "Цільовий батьківський вузол не знайдено" };

  const sourceDepartments = await prisma.orgNode.findMany({ where: { parentId: source.id, type: OrgNodeType.DEPARTMENT } });
  const sourceStaffUnits = await prisma.staffUnit.findMany({
    where: { orgNodeId: { in: [source.id, ...sourceDepartments.map((d) => d.id)] } },
  });

  const created = await prisma.$transaction(async (tx) => {
    const newObject = await tx.orgNode.create({
      data: {
        type: OrgNodeType.OBJECT,
        name: input.name,
        code: input.code || null,
        parentId: targetParent.id,
        path: "0",
      },
    });
    await tx.orgNode.update({ where: { id: newObject.id }, data: { path: `${targetParent.path}.${newObject.id}` } });

    // oldNodeId -> newNodeId: сам об'єкт + клоновані відділи.
    const nodeMap = new Map<number, number>([[source.id, newObject.id]]);

    for (const dept of sourceDepartments) {
      const newDept = await tx.orgNode.create({
        data: { type: OrgNodeType.DEPARTMENT, name: dept.name, parentId: newObject.id, sortOrder: dept.sortOrder, path: "0" },
      });
      const deptPath = `${targetParent.path}.${newObject.id}.${newDept.id}`;
      await tx.orgNode.update({ where: { id: newDept.id }, data: { path: deptPath } });
      nodeMap.set(dept.id, newDept.id);
    }

    for (const su of sourceStaffUnits) {
      const newOrgNodeId = nodeMap.get(su.orgNodeId);
      if (!newOrgNodeId) continue;
      await tx.staffUnit.create({
        data: { positionProfileId: su.positionProfileId, orgNodeId: newOrgNodeId, plannedHeadcount: su.plannedHeadcount },
      });
    }

    return { newObjectId: newObject.id, departmentsCloned: sourceDepartments.length, staffUnitsCloned: sourceStaffUnits.length };
  });

  await logAudit({
    actorId: actorEmploymentId,
    action: "orgNode.createdFromTemplate",
    entityType: "OrgNode",
    entityId: created.newObjectId,
    diff: { sourceObjectId: source.id, ...created },
  });

  return { ok: true as const, ...created };
}

/**
 * Видалення вузла дерева. Дозволене лише для "порожнього" вузла: без дочірніх
 * вузлів, без людей (навіть звільнених), вакансій, терміналів, ділянок, змін,
 * обходів та іншої історії. Порожні штатні одиниці й розклад обходів видаляються
 * разом із вузлом. Інакше повертає зрозумілу причину; для вузлів з історією є "Архівувати".
 */
export async function deleteOrgNode(nodeId: number, actorEmploymentId: number | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const node = await prisma.orgNode.findUnique({
    where: { id: nodeId },
    include: {
      children: { select: { id: true } },
      staffUnits: { include: { _count: { select: { employments: true, vacancies: true } } } },
      _count: {
        select: {
          terminals: true,
          workShifts: true,
          areas: true,
          inspections: true,
          violations: true,
          pendingHires: true,
          announcements: true,
          equipment: true,
          roleAssignments: true,
          positionAccessAssignments: true,
        },
      },
    },
  });
  if (!node) return { ok: false, error: "Вузол не знайдено" };
  if (node.type === OrgNodeType.COMPANY || !node.parentId) return { ok: false, error: "Кореневий вузол компанії видалити не можна" };

  const reasons: string[] = [];
  if (node.children.length) reasons.push(`усередині є ${node.children.length} вкладених вузлів — спершу видаліть або перемістіть їх`);
  const withPeople = node.staffUnits.filter((su) => su._count.employments > 0);
  if (withPeople.length) reasons.push("на штатних одиницях є (або були) працівники");
  if (node.staffUnits.some((su) => su._count.vacancies > 0)) reasons.push("є вакансії");
  const c = node._count;
  if (c.terminals) reasons.push("прив'язані термінали обліку часу");
  if (c.workShifts) reasons.push("є історія відпрацьованих змін");
  if (c.areas) reasons.push("налаштовані ділянки");
  if (c.inspections || c.violations) reasons.push("є історія обходів і порушень");
  if (c.pendingHires) reasons.push("є очікувані реєстрації працівників");
  if (c.announcements) reasons.push("є оголошення");
  if (c.equipment) reasons.push("є обладнання");
  if (c.roleAssignments || c.positionAccessAssignments) reasons.push("є призначення ролей чи прав на цей вузол");

  if (reasons.length) {
    return { ok: false, error: `Не можна видалити: ${reasons.join("; ")}. Якщо вузол більше не потрібен, використайте «Архівувати».` };
  }

  try {
    await prisma.$transaction([
      prisma.inspectionSchedule.deleteMany({ where: { orgNodeId: nodeId } }),
      prisma.staffUnit.deleteMany({ where: { orgNodeId: nodeId } }),
      prisma.orgNode.delete({ where: { id: nodeId } }),
    ]);
  } catch {
    return { ok: false, error: "Не можна видалити: до вузла прив'язані інші дані. Скористайтесь «Архівувати»." };
  }

  await logAudit({ actorId: actorEmploymentId, action: "orgNode.deleted", entityType: "OrgNode", entityId: nodeId, diff: { name: node.name, type: node.type } });
  return { ok: true };
}
