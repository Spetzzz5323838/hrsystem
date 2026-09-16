import { prisma } from "./prisma";
import { getInstanceTasks } from "./onboarding";
import { queueTelegramMessage } from "./notifications";
import { findNearestHead } from "./permissions";
import { TaskStatus, Role, ActionType } from "../generated/prisma/client";

const ESCALATION_DELAY_MS = 24 * 60 * 60 * 1000;

/**
 * SLA-ескалація (docs plan-v1.md §8, п.11): "виконавець, через 24 год —
 * керівник вузла". Викликається щогодини з pg-boss (bot/index.ts).
 *
 * dueAt рахується в момент СТВОРЕННЯ задачі (lib/onboarding.ts), а не
 * коли вона розблоковується — тому заблокований пункт далі в черзі може
 * вже мати dueAt у минулому, хоча виконавець фізично ще не міг за нього
 * взятися. Тут такі пункти свідомо пропускаються (перевірка blocked);
 * саму методику розрахунку dueAt це не виправляє — окрема тема.
 */
export async function checkSlaEscalations(): Promise<void> {
  const now = new Date();

  const overdueCandidates = await prisma.task.findMany({
    where: { status: TaskStatus.PENDING, dueAt: { lt: now }, overdueNotifiedAt: null },
    include: { itemTemplate: true, assignee: { include: { person: true } } },
  });

  const instanceIds = [...new Set(overdueCandidates.map((t) => t.instanceId))];
  const blockedTaskIds = new Set<number>();
  for (const instanceId of instanceIds) {
    const views = await getInstanceTasks(instanceId);
    for (const v of views) {
      if (v.blocked) blockedTaskIds.add(v.taskId);
    }
  }

  for (const task of overdueCandidates) {
    if (blockedTaskIds.has(task.id)) continue;

    if (task.assignee?.person.telegramId) {
      // Для EMPLOYEE-MARK пунктів (докс §6.1, напр. "Згода на обробку
      // персональних даних") додаємо кнопку сюди ж — на випадок, якщо
      // push при розблокуванні (lib/onboarding.ts::notifyEmployeeMarkTask)
      // не дійшов (бот не був запущений тощо), нагадування лишається
      // єдиним шансом реально виконати пункт, не лише дізнатись про нього.
      const replyMarkup =
        task.itemTemplate.responsibleRole === Role.EMPLOYEE && task.itemTemplate.actionType === ActionType.MARK
          ? { inline_keyboard: [[{ text: "Виконано", callback_data: `employee_task_done:${task.id}` }]] }
          : undefined;
      await queueTelegramMessage(
        task.assignee.person.telegramId,
        `Протерміновано: «${task.itemTemplate.title}». Норматив минув ${task.dueAt?.toLocaleString("uk-UA")}.`,
        replyMarkup,
      );
    }
    await prisma.task.update({ where: { id: task.id }, data: { overdueNotifiedAt: now } });
  }

  const escalationCandidates = await prisma.task.findMany({
    where: {
      status: TaskStatus.PENDING,
      escalatedAt: null,
      overdueNotifiedAt: { lt: new Date(now.getTime() - ESCALATION_DELAY_MS) },
    },
    include: {
      itemTemplate: true,
      instance: { include: { employment: { include: { person: true, staffUnit: { include: { orgNode: true } } } } } },
    },
  });

  for (const task of escalationCandidates) {
    const headEmploymentId = await findNearestHead(task.instance.employment.staffUnit.orgNode.path);
    if (headEmploymentId) {
      const head = await prisma.employment.findUnique({ where: { id: headEmploymentId }, include: { person: true } });
      if (head?.person.telegramId) {
        await queueTelegramMessage(
          head.person.telegramId,
          `Ескалація: «${task.itemTemplate.title}» для ${task.instance.employment.person.fullName} протерміновано понад добу.`,
        );
      }
    }
    await prisma.task.update({ where: { id: task.id }, data: { escalatedAt: now } });
  }
}
