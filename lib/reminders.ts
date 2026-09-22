import { prisma } from "./prisma";
import { sendNotification } from "./notificationTemplates";

/**
 * Особисті нагадування бухгалтера/адміністратора про конкретного працівника
 * (правки 20.09.2026, п.7) — не пункт чек-ліста, а вільна нотатка "щоб не
 * забути". Видима лише автору (authorId), ніхто інший її не бачить і не
 * редагує — гейт MANAGE_REMINDERS перевіряється в API-роуті, не тут.
 */
export async function createReminder(employmentId: number, authorId: number, text: string, dueAt: Date | null) {
  return prisma.reminder.create({ data: { employmentId, authorId, text, dueAt } });
}

export async function listReminders(authorId: number, filter: { employmentId?: number; done?: boolean }) {
  return prisma.reminder.findMany({
    where: {
      authorId,
      ...(filter.employmentId ? { employmentId: filter.employmentId } : {}),
      ...(filter.done === undefined ? {} : { isDone: filter.done }),
    },
    include: { employment: { include: { person: true, staffUnit: { include: { positionProfile: true, orgNode: true } } } } },
    orderBy: [{ isDone: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
  });
}

export async function setReminderDone(id: number, authorId: number, isDone: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const reminder = await prisma.reminder.findUnique({ where: { id } });
  if (!reminder) return { ok: false, error: "Нагадування не знайдено" };
  if (reminder.authorId !== authorId) return { ok: false, error: "Це не ваше нагадування" };

  await prisma.reminder.update({ where: { id }, data: { isDone, doneAt: isDone ? new Date() : null } });
  return { ok: true };
}

export async function deleteReminder(id: number, authorId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const reminder = await prisma.reminder.findUnique({ where: { id } });
  if (!reminder) return { ok: false, error: "Нагадування не знайдено" };
  if (reminder.authorId !== authorId) return { ok: false, error: "Це не ваше нагадування" };

  await prisma.reminder.delete({ where: { id } });
  return { ok: true };
}

/**
 * Щогодинна перевірка (bot/index.ts, той самий принцип, що й
 * lib/sla.ts::checkSlaEscalations) — шле автору нагадування в Telegram,
 * коли настав dueAt. notifiedAt захищає від повтору при наступному тику.
 */
export async function checkDueReminders(): Promise<void> {
  const now = new Date();
  const due = await prisma.reminder.findMany({
    where: { isDone: false, notifiedAt: null, dueAt: { lte: now } },
    include: { author: true, employment: { include: { person: true } } },
  });

  for (const r of due) {
    await sendNotification(r.author.personId, "reminder.due", { text: r.text, fullName: r.employment.person.fullName });
    await prisma.reminder.update({ where: { id: r.id }, data: { notifiedAt: now } });
  }
}
