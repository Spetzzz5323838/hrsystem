import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";
import { resolveAssignee, completeTask as completeGenericTask } from "./onboarding";
import { logAudit } from "./audit";
import { renderClearanceSheetPdf } from "./pdf";
import { createVacancy } from "./vacancies";
import { EmploymentStatus, ProcessState, ProcessType, TaskStatus, VacancyReason } from "../generated/prisma/client";

// PDF листа узгодження — поза `public/`, як і скани документів.
const CLEARANCE_STORAGE_ROOT = path.join(process.cwd(), "storage", "clearance-sheets");

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const TASK_STATUS_LABELS: Record<string, string> = {
  DONE: "Виконано",
  PENDING: "Не виконано",
};

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

  // docs plan-v1.md §4.4: "Блокування — при TERMINATION_STARTED — автоматичне
  // зняття всіх RoleAssignment і активних сесій". RoleAssignment прив'язаний
  // саме до цього employmentId (не до Person) — знімаються тільки ролі цього
  // працевлаштування. Сесії прив'язані до Person, тож знімаються всі — на
  // цьому масштабі одна людина не має двох одночасно ACTIVE employment.
  const [revokedRoles, revokedSessions] = await Promise.all([
    prisma.roleAssignment.deleteMany({ where: { employmentId } }),
    prisma.session.deleteMany({ where: { personId: employment.personId } }),
  ]);

  if (revokedRoles.count > 0 || revokedSessions.count > 0) {
    await logAudit({
      actorId: initiatorEmploymentId,
      action: "termination.accessRevoked",
      entityType: "Employment",
      entityId: employmentId,
      diff: { revokedRoles: revokedRoles.count, revokedSessions: revokedSessions.count },
    });
  }

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
      assigneeId = await resolveAssignee(item.responsibleRole, targetPath, employment.id);
    }

    const dueAt = item.slaHours != null ? new Date(now.getTime() + item.slaHours * 60 * 60 * 1000) : null;

    await prisma.task.create({
      data: { instanceId: instance.id, itemTemplateId: item.id, assigneeId, status, dueAt, completedAt },
    });
  }

  await logAudit({
    actorId: initiatorEmploymentId,
    action: "termination.started",
    entityType: "Employment",
    entityId: employmentId,
    diff: { reasonCode: input.reasonCode, lastWorkingDay: input.lastWorkingDay },
  });

  // Вакансія відкривається одразу при ІНІЦІАЦІЇ звільнення, не при
  // завершенні (з розмови 2026-09-23) — адміністратор знає заздалегідь і
  // може почати пошук заміни, поки людина ще доопрацьовує.
  await createVacancy(employment.staffUnitId, VacancyReason.TERMINATION, initiatorEmploymentId);

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
    await logAudit({
      actorId: completedByEmploymentId,
      action: "termination.completed",
      entityType: "Employment",
      entityId: task.instance.employmentId,
    });
  }

  return { ok: true };
}

export type ClearanceSheetView = {
  id: number;
  number: string;
  isComplete: boolean;
  hash: string;
  generatedAt: Date;
};

/**
 * Кнопка друку доступна завжди (docs plan-v1.md §12.2): якщо не всі
 * блокуючі пункти закрито — isComplete=false, документ отримує позначку
 * "ПОПЕРЕДНІЙ" і в PDF, і в UI.
 *
 * Блок "Обладнання" в PDF показує лише те, що закріплено на цю мить
 * (Equipment.responsibleId) — свідоме спрощення: моделі бракує історії
 * квитувань, тому вже звільнене (cleared) обладнання зі списку зникає.
 */
export async function generateClearanceSheet(instanceId: number, generatedByEmploymentId: number): Promise<ClearanceSheetView> {
  const instance = await prisma.processInstance.findUniqueOrThrow({
    where: { id: instanceId },
    include: {
      employment: {
        include: {
          person: true,
          staffUnit: { include: { positionProfile: true, orgNode: true } },
          terminationReason: true,
        },
      },
    },
  });

  const tasks = await prisma.task.findMany({
    where: { instanceId },
    include: {
      itemTemplate: true,
      assignee: { include: { person: true } },
      completedBy: { include: { person: true } },
    },
    orderBy: { itemTemplate: { order: "asc" } },
  });

  const isComplete = tasks.filter((t) => t.itemTemplate.isBlocking).every((t) => t.status === TaskStatus.DONE);
  const unresolvedItems = tasks
    .filter((t) => t.itemTemplate.isBlocking && t.status !== TaskStatus.DONE)
    .map((t) => t.itemTemplate.title);

  const stateSummary = tasks.map((t) => `${t.id}:${t.status}:${t.completedAt ?? ""}`).join("|");
  const hash = createHash("sha256").update(stateSummary).digest("hex");

  const year = new Date().getFullYear();
  const count = await prisma.clearanceSheet.count({ where: { number: { startsWith: `ЗВ-${year}-` } } });
  const number = `ЗВ-${year}-${String(count + 1).padStart(4, "0")}`;

  const generatedBy = await prisma.employment.findUniqueOrThrow({
    where: { id: generatedByEmploymentId },
    include: { person: true },
  });

  // Обладнання для листа — не лише поточний стан (Equipment.responsibleId),
  // а й те, що вже квитовано в межах САМЕ ЦЬОГО процесу звільнення: інакше
  // пункт зникає зі списку одразу, як тільки ревізор його зніме, і в PDF
  // виглядає так, наче обладнання взагалі не було.
  const [stillAssigned, clearedEvents] = await Promise.all([
    prisma.equipment.findMany({ where: { responsibleId: instance.employmentId }, orderBy: { inventoryNo: "asc" } }),
    prisma.equipmentEvent.findMany({
      where: { processInstanceId: instanceId, type: "CLEARED" },
      include: { equipment: true, performedBy: { include: { person: true } } },
      orderBy: { occurredAt: "asc" },
    }),
  ]);

  const equipment = [
    ...clearedEvents.map((ev) => ({
      inventoryNo: ev.equipment.inventoryNo,
      name: ev.equipment.name,
      statusStr: `квитовано ${fmtDateTime(ev.occurredAt)} (${ev.performedBy.person.fullName})`,
    })),
    ...stillAssigned.map((eq) => ({ inventoryNo: eq.inventoryNo, name: eq.name, statusStr: "ще не квитовано" })),
  ];

  const initiatorTask = tasks.find((t) => t.itemTemplate.order === 1);
  const generatedAt = new Date();

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

  const pdfBuffer = await renderClearanceSheetPdf({
    number,
    isComplete,
    fullName: instance.employment.person.fullName,
    positionTitle: instance.employment.staffUnit.positionProfile.title,
    objectName: instance.employment.staffUnit.orgNode.name,
    reasonName: instance.employment.terminationReason?.name ?? "—",
    hiredAtStr: fmtDate(instance.employment.hiredAt),
    startedAtStr: fmtDateTime(instance.startedAt),
    lastWorkingDayStr: fmtDate(instance.employment.lastWorkingDay),
    initiatorName: initiatorTask?.assignee?.person.fullName ?? "—",
    tasks: tasks.map((t) => ({
      order: t.itemTemplate.order,
      title: t.itemTemplate.title,
      responsibleName: t.completedBy?.person.fullName ?? t.assignee?.person.fullName ?? "—",
      statusLabel: TASK_STATUS_LABELS[t.status] ?? t.status,
      whenStr: fmtDateTime(t.completedAt),
      comment: t.comment ?? "",
    })),
    equipment,
    unresolvedItems,
    generatedByName: generatedBy.person.fullName,
    generatedAtStr: fmtDateTime(generatedAt),
    hash,
  });

  const dir = path.join(CLEARANCE_STORAGE_ROOT, String(instance.employmentId));
  await fs.mkdir(dir, { recursive: true });
  const pdfPath = path.join(dir, `${number}.pdf`);
  await fs.writeFile(pdfPath, pdfBuffer);

  await prisma.clearanceSheet.update({ where: { id: sheet.id }, data: { pdfPath } });

  return { id: sheet.id, number: sheet.number, isComplete: sheet.isComplete, hash: sheet.hash, generatedAt };
}
