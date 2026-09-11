import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { resolveAssignee, completeTask as completeGenericTask, getInstanceTasks } from "./onboarding";
import { EmploymentStatus, ProcessState, ProcessType, TaskStatus } from "../generated/prisma/client";

export async function startTermination(
  employmentId: number,
  input: { reasonCode: string; lastWorkingDay: Date },
  initiatorEmploymentId: number,
): Promise<{ ok: true; instanceId: number } | { ok: false; error: string }> {
  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: { staffUnit: { include: { orgNode: true, positionProfile: true } } },
  });
  if (!employment) return { ok: false, error: "Працівника не знайдено" };
  if (employment.status !== EmploymentStatus.ACTIVE) {
    return { ok: false, error: "Звільнити можна тільки активного працівника" };
  }

  const reason = await prisma.terminationReason.findUnique({ where: { code: input.reasonCode } });
  if (!reason || !reason.isActive) return { ok: false, error: "Невідома причина звільнення" };

  const template = await prisma.processTemplate.findFirstOrThrow({
    where: { code: "OFFBOARDING_BASE", type: ProcessType.OFFBOARDING, isActive: true },
    orderBy: { version: "desc" },
  });

  const allItems = await prisma.checklistItemTemplate.findMany({
    where: { templateId: template.id },
    orderBy: { order: "asc" },
  });

  // Пункт "Інвентаризація та передача ТМЦ" — тільки для МВО-профілів (docs v1.1 §8.1).
  const liable = employment.staffUnit.positionProfile.isMateriallyLiable;
  const items = allItems.filter((it) => (it.title.includes("ТМЦ") ? liable : true));

  const instance = await prisma.processInstance.create({
    data: { employmentId, templateId: template.id, state: ProcessState.RUNNING },
  });

  await prisma.employment.update({
    where: { id: employmentId },
    data: {
      status: EmploymentStatus.TERMINATION_STARTED,
      terminationReasonCode: input.reasonCode,
      lastWorkingDay: input.lastWorkingDay,
    },
  });

  const now = new Date();
  const targetPath = employment.staffUnit.orgNode.path;

  for (const item of items) {
    let assigneeId: number | null = null;
    let status: TaskStatus = TaskStatus.PENDING;
    let completedAt: Date | null = null;

    if (item.order === 1) {
      // Ініціація вже виконана самим стартом звільнення.
      status = TaskStatus.DONE;
      completedAt = now;
      assigneeId = initiatorEmploymentId;
    } else if (item.order === 5) {
      // "Блокування доступу до системи" — системне, миттєве.
      status = TaskStatus.DONE;
      completedAt = now;
    } else if (item.order === 16) {
      // "Архівація, статус TERMINATED" — залишається відкритим до кінця:
      // completeTerminationTask сам закриє його, коли решта пунктів готова.
      assigneeId = null;
    } else if (item.responsibleRole) {
      assigneeId = await resolveAssignee(item.responsibleRole, targetPath);
    }

    const dueAt = item.slaHours != null ? new Date(now.getTime() + item.slaHours * 60 * 60 * 1000) : null;

    await prisma.task.create({
      data: { instanceId: instance.id, itemTemplateId: item.id, assigneeId, status, dueAt, completedAt },
    });
  }

  return { ok: true, instanceId: instance.id };
}

/**
 * Як completeTask, але коли всі пункти, окрім фінального "Архівація"
 * (order=16), закриті — сам закриває й пункт 16, і переводить статус у
 * TERMINATED (docs plan-v1.md §12.1).
 */
export async function completeTerminationTask(
  taskId: number,
  completedByEmploymentId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { instance: true } });
  if (!task) return { ok: false, error: "Задачу не знайдено" };

  const result = await completeGenericTask(taskId, completedByEmploymentId);
  if (!result.ok) return result;

  // Тільки блокуючі пункти гейтять закриття (docs plan-v1.md §12.1: "усі
  // блокуючі DONE" — неблокуючі "Повернення техніки"/"Передача справ"/
  // "Вихідне інтерв'ю" можуть лишитись відкритими).
  const remaining = await prisma.task.count({
    where: {
      instanceId: task.instanceId,
      status: { not: TaskStatus.DONE },
      itemTemplate: { order: { not: 16 }, isBlocking: true },
    },
  });

  if (remaining === 0) {
    const finalTask = await prisma.task.findFirst({
      where: { instanceId: task.instanceId, itemTemplate: { order: 16 } },
    });
    if (finalTask && finalTask.status !== TaskStatus.DONE) {
      await prisma.task.update({ where: { id: finalTask.id }, data: { status: TaskStatus.DONE, completedAt: new Date() } });
    }
    await prisma.processInstance.update({ where: { id: task.instanceId }, data: { state: ProcessState.DONE, finishedAt: new Date() } });
    await prisma.employment.update({
      where: { id: task.instance.employmentId },
      data: { status: EmploymentStatus.TERMINATED, terminatedAt: new Date() },
    });
  }

  return { ok: true };
}

export type ClearanceSheetView = {
  number: string;
  isComplete: boolean;
  hash: string;
  generatedAt: Date;
};

/**
 * Кнопка друку доступна завжди (docs plan-v1.md §12.2): якщо не всі
 * блокуючі пункти закрито — isComplete=false, документ вважається
 * "ПОПЕРЕДНІМ". pdfPath не генерується — Puppeteer не піднятий.
 */
export async function generateClearanceSheet(instanceId: number, generatedByEmploymentId: number): Promise<ClearanceSheetView> {
  const instance = await prisma.processInstance.findUniqueOrThrow({ where: { id: instanceId } });
  const tasks = await getInstanceTasks(instanceId);

  const isComplete = tasks
    .filter((t) => t.isBlocking)
    .every((t) => t.status === "DONE");

  const stateSummary = tasks.map((t) => `${t.taskId}:${t.status}:${t.completedAt ?? ""}`).join("|");
  const hash = createHash("sha256").update(stateSummary).digest("hex");

  const year = new Date().getFullYear();
  const count = await prisma.clearanceSheet.count({ where: { number: { startsWith: `ЗВ-${year}-` } } });
  const number = `ЗВ-${year}-${String(count + 1).padStart(4, "0")}`;

  const sheet = await prisma.clearanceSheet.create({
    data: {
      number,
      employmentId: instance.employmentId,
      instanceId,
      generatedById: generatedByEmploymentId,
      isComplete,
      hash,
    },
  });

  return { number: sheet.number, isComplete: sheet.isComplete, hash: sheet.hash, generatedAt: sheet.generatedAt };
}
