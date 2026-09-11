import { prisma } from "./prisma";
import { getCompetencyDelta } from "./competencies";
import { resolveAssignee, completeTask as completeGenericTask } from "./onboarding";
import { EmploymentStatus, ProcessState, ProcessType, TaskStatus, OrgNodeType, Role } from "../generated/prisma/client";

/** Погоджувач переведення = керівник найближчого спільного вузла рівня
 * DIVISION/COMPANY (docs v1.2 §2.1) — інший принцип, ніж resolveAssignee
 * з lib/onboarding.ts (там — за роллю й областю грантів). */
async function resolveTransferApprover(fromPath: string, toPath: string): Promise<number | null> {
  const fromIds = fromPath.split(".").map(Number);
  const toIds = toPath.split(".").map(Number);

  let sharedLength = 0;
  while (sharedLength < fromIds.length && sharedLength < toIds.length && fromIds[sharedLength] === toIds[sharedLength]) {
    sharedLength++;
  }
  if (sharedLength === 0) return null;

  const sharedIds = fromIds.slice(0, sharedLength);
  const nodes = await prisma.orgNode.findMany({ where: { id: { in: sharedIds } } });
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (let i = sharedIds.length - 1; i >= 0; i--) {
    const node = byId.get(sharedIds[i]);
    if (node && (node.type === OrgNodeType.DIVISION || node.type === OrgNodeType.COMPANY) && node.headEmploymentId) {
      return node.headEmploymentId;
    }
  }
  return null;
}

export async function startTransfer(
  employmentId: number,
  targetStaffUnitId: number,
  initiatorEmploymentId: number,
): Promise<{ ok: true; instanceId: number } | { ok: false; error: string }> {
  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: { staffUnit: { include: { orgNode: true } } },
  });
  if (!employment) return { ok: false, error: "Працівника не знайдено" };
  if (employment.status !== EmploymentStatus.ACTIVE) {
    return { ok: false, error: "Перевести можна тільки активного працівника" };
  }

  const existingInstance = await prisma.processInstance.findFirst({
    where: { employmentId, state: ProcessState.RUNNING, template: { type: ProcessType.TRANSFER } },
  });
  if (existingInstance) return { ok: false, error: "Переведення вже триває" };

  const targetStaffUnit = await prisma.staffUnit.findUnique({
    where: { id: targetStaffUnitId },
    include: { orgNode: true, positionProfile: true },
  });
  if (!targetStaffUnit) return { ok: false, error: "Нову штатну одиницю не знайдено" };

  const delta = await getCompetencyDelta(employment.personId, targetStaffUnit.positionProfileId);
  const hasGaps = delta.some((d) => d.state !== "valid");
  const liable = targetStaffUnit.positionProfile.isMateriallyLiable;

  const template = await prisma.processTemplate.findFirstOrThrow({
    where: { code: "TRANSFER_BASE", isActive: true },
    orderBy: { version: "desc" },
  });

  const allItems = await prisma.checklistItemTemplate.findMany({
    where: { templateId: template.id },
    orderBy: { order: "asc" },
  });

  // Пункти 3 (ТМЦ) і 6-7 (дельта-навчання/атестація) — умовні для
  // конкретного переведення, не для шаблону (докс v1.2 §2.2).
  const items = allItems.filter((it) => {
    if (it.title.includes("ТМЦ")) return liable;
    if (it.title.includes("Дельта-навчання") || it.title.includes("Атестація за новим")) return hasGaps;
    return true;
  });

  const instance = await prisma.processInstance.create({
    data: { employmentId, templateId: template.id, state: ProcessState.RUNNING },
  });
  await prisma.employment.update({ where: { id: employmentId }, data: { status: EmploymentStatus.TRANSFER_PENDING } });

  const now = new Date();
  const approverId = await resolveTransferApprover(employment.staffUnit.orgNode.path, targetStaffUnit.orgNode.path);

  for (const item of items) {
    let assigneeId: number | null = null;
    let status: TaskStatus = TaskStatus.PENDING;
    let completedAt: Date | null = null;
    let payload: { targetStaffUnitId: number } | undefined;

    if (item.order === 1) {
      // Ініціація вже виконана самим стартом переведення.
      status = TaskStatus.DONE;
      completedAt = now;
      assigneeId = initiatorEmploymentId;
      payload = { targetStaffUnitId };
    } else if (item.order === 9) {
      // Штатний розпис у нас рахується на льоту (structure screen) —
      // окремого запису "оновити" не існує, тому пункт системний і готовий.
      status = TaskStatus.DONE;
      completedAt = now;
    } else if (item.title.includes("Погодження")) {
      assigneeId = approverId;
    } else if (item.responsibleRole === Role.CURATOR) {
      // Куратор при переведенні не призначається наново — береться вже
      // наявний Employment.curatorId (з онбордингу чи попереднього призначення).
      assigneeId = employment.curatorId;
    } else if (item.responsibleRole) {
      assigneeId = await resolveAssignee(item.responsibleRole, targetStaffUnit.orgNode.path);
    }

    const dueAt = item.slaHours != null ? new Date(now.getTime() + item.slaHours * 60 * 60 * 1000) : null;

    await prisma.task.create({
      data: { instanceId: instance.id, itemTemplateId: item.id, assigneeId, status, dueAt, completedAt, payload },
    });
  }

  return { ok: true, instanceId: instance.id };
}

/**
 * Як completeTask з lib/onboarding.ts, але з побічним ефектом: закриття
 * пункту "Кадрове оформлення" реально переносить людину на нову штатну
 * одиницю — докс v1.2 §2.2: "працівник продовжує працювати на старому
 * місці, доки пункт 5 не закрито". Завершення всіх пунктів повертає
 * статус ACTIVE.
 */
export async function completeTransferTask(
  taskId: number,
  completedByEmploymentId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { itemTemplate: true, instance: true },
  });
  if (!task) return { ok: false, error: "Задачу не знайдено" };

  const result = await completeGenericTask(taskId, completedByEmploymentId);
  if (!result.ok) return result;

  if (task.itemTemplate.title.includes("Кадрове оформлення")) {
    const initTask = await prisma.task.findFirst({
      where: { instanceId: task.instanceId, itemTemplate: { order: 1 } },
    });
    const payload = initTask?.payload as { targetStaffUnitId?: number } | null;
    if (payload?.targetStaffUnitId) {
      await prisma.employment.update({
        where: { id: task.instance.employmentId },
        data: { staffUnitId: payload.targetStaffUnitId },
      });
    }
  }

  // Тільки блокуючі пункти гейтять повернення в ACTIVE — неблокуюче
  // "Закріплення обладнання" може лишитись відкритим.
  const remaining = await prisma.task.count({
    where: { instanceId: task.instanceId, status: { not: TaskStatus.DONE }, itemTemplate: { isBlocking: true } },
  });
  if (remaining === 0) {
    await prisma.employment.update({ where: { id: task.instance.employmentId }, data: { status: EmploymentStatus.ACTIVE } });
  }

  return { ok: true };
}
