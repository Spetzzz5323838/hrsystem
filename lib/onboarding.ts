import { prisma } from "./prisma";
import { hasAccess } from "./access";
import { logAudit } from "./audit";
import { queueTelegramMessage } from "./notifications";
import { getCompetencyDelta } from "./competencies";
import { checkProfileClosedBadge, checkBeyondProfileBadge, checkFastStartBadge, checkMentorBadge } from "./rating";
import {
  Role,
  ActionType,
  TaskStatus,
  ProcessState,
  ProcessType,
  EmploymentStatus,
  CompetencySource,
} from "../generated/prisma/client";

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Резолвінг виконавця за роллю й областю: хто зараз має цю роль
 * (systemRole посади або функціональна RoleAssignment) і чия область
 * покриває вузол працівника. Якщо кандидатів декілька — береться той,
 * чия область найточніша (найдовший шлях).
 */
export async function resolveAssignee(role: Role, targetOrgNodePath: string): Promise<number | null> {
  const bySystemRole = await prisma.employment.findMany({
    where: { status: { not: EmploymentStatus.TERMINATED }, staffUnit: { positionProfile: { systemRole: role } } },
    select: { id: true, staffUnit: { select: { orgNode: { select: { path: true } } } } },
  });

  const byRoleAssignment = await prisma.employment.findMany({
    where: { status: { not: EmploymentStatus.TERMINATED }, roleAssignments: { some: { role } } },
    select: { id: true, roleAssignments: { where: { role }, select: { orgNode: { select: { path: true } } } } },
  });

  const candidates: { employmentId: number; path: string }[] = [];

  for (const e of bySystemRole) {
    if (hasAccess(e.staffUnit.orgNode.path, targetOrgNodePath)) {
      candidates.push({ employmentId: e.id, path: e.staffUnit.orgNode.path });
    }
  }
  for (const e of byRoleAssignment) {
    for (const ra of e.roleAssignments) {
      if (hasAccess(ra.orgNode.path, targetOrgNodePath)) {
        candidates.push({ employmentId: e.id, path: ra.orgNode.path });
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.path.length - a.path.length);
  return candidates[0].employmentId;
}

/**
 * Запускає онбординг для працевлаштування: бере активну версію шаблону
 * ONBOARDING_BASE, фільтрує пункти за moduleFlags посади (базові — завжди),
 * і створює Task для кожного, з резолвленим виконавцем.
 *
 * EMPLOYEE -> сам працівник. CURATOR -> Employment.curatorId, якщо вже
 * призначений (напр. при повторному найманні); для першого онбордингу
 * зазвичай ще null — доти, доки не виконано пункт №4 "Призначення
 * куратора" (completeCuratorAssignmentTask нижче). null (пункти AUTO без
 * ролі) -> задача одразу DONE.
 */
/**
 * Пункт 11 базового шаблону ("Надсилання welcomebook і матеріалів LMS")
 * раніше був AUTO-заглушкою — позначався DONE без реальної відправки.
 * Тепер справді шле список sendViaBot-матеріалів позиції в Telegram
 * (docs plan-v1.md §9.1: PDF/welcomebook дублюються в боті). Файлів як
 * таких нема (Material.url/filePath у seed не заповнені) — шлемо назви
 * списком, посилання, якщо є. Мовчки виходить, якщо в людини ще нема
 * telegramId (окрема команда /link) або матеріалів немає.
 */
async function sendOnboardingMaterials(employment: { personId: number; staffUnit: { positionProfileId: number } }): Promise<void> {
  const person = await prisma.person.findUnique({ where: { id: employment.personId } });
  if (!person?.telegramId) return;

  const materials = await prisma.material.findMany({
    where: {
      sendViaBot: true,
      competency: { positionCompetencies: { some: { positionProfileId: employment.staffUnit.positionProfileId } } },
    },
    orderBy: { id: "asc" },
  });
  if (!materials.length) return;

  const lines = materials.map((m) => `• ${m.title}${m.url ? ` — ${m.url}` : ""}`);
  await queueTelegramMessage(person.telegramId, `Ласкаво просимо! Ваші навчальні матеріали для початку роботи:\n\n${lines.join("\n")}`);
}

export async function startOnboarding(employmentId: number): Promise<{ instanceId: number; alreadyExisted: boolean }> {
  const existing = await prisma.processInstance.findFirst({
    where: { employmentId, state: ProcessState.RUNNING },
  });
  if (existing) return { instanceId: existing.id, alreadyExisted: true };

  const employment = await prisma.employment.findUniqueOrThrow({
    where: { id: employmentId },
    include: { staffUnit: { include: { orgNode: true, positionProfile: true } } },
  });

  const template = await prisma.processTemplate.findFirstOrThrow({
    where: { code: "ONBOARDING_BASE", type: ProcessType.ONBOARDING, isActive: true },
    orderBy: { version: "desc" },
  });

  const moduleFlags = employment.staffUnit.positionProfile.moduleFlags;
  const items = await prisma.checklistItemTemplate.findMany({
    where: {
      templateId: template.id,
      OR: [{ module: null }, { module: { in: moduleFlags } }],
    },
    orderBy: { order: "asc" },
  });

  const instance = await prisma.processInstance.create({
    data: { employmentId, templateId: template.id, state: ProcessState.RUNNING },
  });

  const targetPath = employment.staffUnit.orgNode.path;
  const now = new Date();

  for (const item of items) {
    let assigneeId: number | null = null;
    let status: TaskStatus = TaskStatus.PENDING;
    let completedAt: Date | null = null;

    if (item.actionType === ActionType.AUTO) {
      status = TaskStatus.DONE;
      completedAt = now;
      if (item.order === 11) {
        await sendOnboardingMaterials(employment);
      }
    } else if (item.responsibleRole === Role.EMPLOYEE) {
      assigneeId = employment.id;
    } else if (item.responsibleRole === Role.CURATOR) {
      assigneeId = employment.curatorId;
    } else if (item.responsibleRole) {
      assigneeId = await resolveAssignee(item.responsibleRole, targetPath);
    }

    const dueAt = item.slaHours != null ? new Date(now.getTime() + item.slaHours * 60 * 60 * 1000) : null;

    await prisma.task.create({
      data: { instanceId: instance.id, itemTemplateId: item.id, assigneeId, status, dueAt, completedAt },
    });
  }

  return { instanceId: instance.id, alreadyExisted: false };
}

export type TaskView = {
  taskId: number;
  order: number;
  title: string;
  responsibleRole: Role | null;
  actionType: ActionType;
  module: string | null;
  isBlocking: boolean;
  status: TaskStatus;
  blocked: boolean;
  overdue: boolean;
  assigneeId: number | null;
  assigneeName: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
};

/** Тасклист інстансу з порахованим blocked/overdue (не зберігається — рахується тут). */
export async function getInstanceTasks(instanceId: number): Promise<TaskView[]> {
  const tasks = await prisma.task.findMany({
    where: { instanceId },
    include: {
      itemTemplate: true,
      assignee: { include: { person: true } },
    },
    orderBy: { itemTemplate: { order: "asc" } },
  });

  const firstOpenIndex = tasks.findIndex((t) => t.status !== TaskStatus.DONE && t.itemTemplate.isBlocking);
  const now = new Date();

  return tasks.map((t, i) => {
    const blocked = t.itemTemplate.isBlocking && firstOpenIndex !== -1 && i > firstOpenIndex && t.status !== TaskStatus.DONE;
    const overdue = t.status === TaskStatus.PENDING && !blocked && t.dueAt != null && t.dueAt < now;

    return {
      taskId: t.id,
      order: t.itemTemplate.order,
      title: t.itemTemplate.title,
      responsibleRole: t.itemTemplate.responsibleRole,
      actionType: t.itemTemplate.actionType,
      module: t.itemTemplate.module,
      isBlocking: t.itemTemplate.isBlocking,
      status: t.status,
      blocked,
      overdue,
      assigneeId: t.assigneeId,
      assigneeName: t.assignee?.person.fullName ?? null,
      dueAt: t.dueAt,
      completedAt: t.completedAt,
    };
  });
}

/**
 * Позначає задачу виконаною — тільки якщо вона не заблокована й ще не DONE.
 *
 * Механізм атестації (звужений обсяг — docs catalogs-v1.1 §7 описує повний
 * конструктор із відсотковими розділами й провалом/повторними спробами,
 * тут лише запис результату):
 * - пункт actionType=TEST із прив'язаною компетенцією (`itemTemplate.competencyId`)
 *   вимагає `input.score` і пише CompetencyRecord(source=TEST) для неї;
 * - пункт із назвою, що починається на "Атестація" (і онбординг, і
 *   "Атестація за новим профілем" при переведенні — обидва йдуть через
 *   цю саму функцію), при виконанні закриває решту дельти профілю
 *   CompetencyRecord(source=ATTESTATION) — усе, що ще не valid.
 */
export async function completeTask(
  taskId: number,
  completedByEmploymentId: number,
  input?: { score?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      itemTemplate: true,
      instance: {
        include: {
          employment: { include: { staffUnit: { include: { positionProfile: true } } } },
        },
      },
    },
  });
  if (!task) return { ok: false, error: "Задачу не знайдено" };
  if (task.status === TaskStatus.DONE) return { ok: false, error: "Уже виконано" };

  const tasksInInstance = await getInstanceTasks(task.instanceId);
  const thisView = tasksInInstance.find((t) => t.taskId === taskId);
  if (thisView?.blocked) return { ok: false, error: "Заблоковано попереднім пунктом" };

  const employment = task.instance.employment;
  const now = new Date();

  if (task.itemTemplate.actionType === ActionType.TEST && task.itemTemplate.competencyId) {
    const score = input?.score;
    if (score == null || !Number.isFinite(score) || score < 0 || score > 100) {
      return { ok: false, error: "Потрібен бал складання (0-100)" };
    }
    const competency = await prisma.competency.findUniqueOrThrow({ where: { id: task.itemTemplate.competencyId } });
    await prisma.competencyRecord.create({
      data: {
        personId: employment.personId,
        competencyId: competency.id,
        passedAt: now,
        score,
        validUntil: competency.validMonths ? addMonths(now, competency.validMonths) : null,
        source: CompetencySource.TEST,
      },
    });
    await checkProfileClosedBadge(employment.personId);
    await checkBeyondProfileBadge(employment.personId);
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: TaskStatus.DONE, completedAt: now, completedById: completedByEmploymentId },
  });

  if (task.itemTemplate.title.startsWith("Атестація")) {
    const delta = await getCompetencyDelta(employment.personId, employment.staffUnit.positionProfileId);
    for (const row of delta) {
      if (row.state === "valid") continue;
      await prisma.competencyRecord.create({
        data: {
          personId: employment.personId,
          competencyId: row.competencyId,
          passedAt: now,
          validUntil: row.validMonths ? addMonths(now, row.validMonths) : null,
          source: CompetencySource.ATTESTATION,
        },
      });
    }

    await checkProfileClosedBadge(employment.personId);
    await checkBeyondProfileBadge(employment.personId);

    // Докс plan-v1.md §8, п.10: "Атестацію складено → статус ACTIVE". Лише
    // для онбордингу — "Атестація за новим профілем" при переведенні йде
    // за власним переходом у lib/transfer.ts (гейтиться рештою пунктів
    // переведення: обладнання тощо), тут його випереджати не можна. Те
    // саме для fast_start/mentor — це про перший вихід стажера на посаду,
    // не про переведення.
    if (task.itemTemplate.title === "Атестація") {
      await prisma.employment.update({ where: { id: employment.id }, data: { status: EmploymentStatus.ACTIVE } });
      await logAudit({
        actorId: completedByEmploymentId,
        action: "onboarding.activated",
        entityType: "Employment",
        entityId: employment.id,
      });
      await checkFastStartBadge(employment.personId);
      if (employment.curatorId) {
        await checkMentorBadge(employment.curatorId);
      }
    }
  }

  // Тільки блокуючі пункти гейтять закриття інстансу — неблокуючі
  // (напр. "Знайомство з колективом") можуть лишитись відкритими.
  const remaining = await prisma.task.count({
    where: { instanceId: task.instanceId, status: { not: TaskStatus.DONE }, itemTemplate: { isBlocking: true } },
  });
  if (remaining === 0) {
    await prisma.processInstance.update({
      where: { id: task.instanceId },
      data: { state: ProcessState.DONE, finishedAt: now },
    });
  }

  return { ok: true };
}

/**
 * Завершує пункт "Призначення куратора": ставить Employment.curatorId і
 * одразу дорезолвлює всі інші ще не призначені CURATOR-задачі цього ж
 * інстансу (напр. "Стажування під наглядом куратора"), які до цього
 * чекали з assigneeId=null.
 */
export async function completeCuratorAssignmentTask(
  taskId: number,
  curatorEmploymentId: number,
  completedByEmploymentId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { instance: true } });
  if (!task) return { ok: false, error: "Задачу не знайдено" };

  const curator = await prisma.employment.findUnique({
    where: { id: curatorEmploymentId },
    include: { staffUnit: { include: { positionProfile: true } }, person: true },
  });
  if (!curator || curator.status === EmploymentStatus.TERMINATED) {
    return { ok: false, error: "Куратора не знайдено" };
  }
  if (!curator.staffUnit.positionProfile.canBeCurator) {
    return { ok: false, error: "Ця людина не може бути куратором за профілем посади" };
  }

  const trainee = await prisma.employment.update({
    where: { id: task.instance.employmentId },
    data: { curatorId: curatorEmploymentId },
    include: { person: true, staffUnit: { include: { positionProfile: true } } },
  });

  if (curator.person.telegramId) {
    await queueTelegramMessage(
      curator.person.telegramId,
      `У вас новий підопічний: ${trainee.person.fullName} (${trainee.staffUnit.positionProfile.title}). Чек-ліст онбордингу — в системі.`,
    );
  }

  await logAudit({
    actorId: completedByEmploymentId,
    action: "curator.assigned",
    entityType: "Employment",
    entityId: task.instance.employmentId,
    diff: { curatorEmploymentId },
  });

  await prisma.task.updateMany({
    where: {
      instanceId: task.instanceId,
      assigneeId: null,
      status: TaskStatus.PENDING,
      itemTemplate: { responsibleRole: Role.CURATOR },
    },
    data: { assigneeId: curatorEmploymentId },
  });

  return completeTask(taskId, completedByEmploymentId);
}
