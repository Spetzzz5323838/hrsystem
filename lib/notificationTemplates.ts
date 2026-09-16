import { prisma } from "./prisma";
import { queueTelegramMessage } from "./notifications";
import { sendTelegramMessage } from "./telegram";
import { NotificationStatus } from "../generated/prisma/client";

/** Підставляє `{{ім'я}}` зі vars; незнайдений плейсхолдер лишається як є — помітно під час перевірки. */
function render(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, name) => vars[name] ?? match);
}

async function renderTemplate(key: string, vars: Record<string, string>): Promise<string> {
  const template = await prisma.notificationTemplate.findUnique({ where: { key } });
  if (!template) throw new Error(`Немає шаблону сповіщення "${key}" — перевірте prisma/seed.ts`);
  return render(template.text, vars);
}

/**
 * Основний шлях для сповіщень (докс plan-v1.md §8): рендерить шаблон із
 * бази, пише рядок у `Notification` (QUEUED), кладе в чергу pg-boss.
 * Статус QUEUED→SENT/FAILED виставляє воркер (lib/notifications.ts) після
 * реальної спроби відправки — тут ми самого факту доставки ще не знаємо.
 */
export async function sendNotification(
  recipientPersonId: number,
  templateKey: string,
  vars: Record<string, string>,
  replyMarkup?: unknown,
): Promise<void> {
  const text = await renderTemplate(templateKey, vars);
  const person = await prisma.person.findUnique({ where: { id: recipientPersonId } });

  if (!person?.telegramId) {
    await prisma.notification.create({
      data: { recipientId: recipientPersonId, templateKey, text, status: NotificationStatus.FAILED, error: "Немає прив'язаного Telegram" },
    });
    return;
  }

  const notification = await prisma.notification.create({
    data: { recipientId: recipientPersonId, templateKey, text, status: NotificationStatus.QUEUED },
  });
  await queueTelegramMessage(person.telegramId, text, replyMarkup, notification.id);
}

/**
 * Синхронний шлях — лише для блокуючих кроків, де черга внесла б
 * непередбачувану затримку (зараз єдиний випадок: 2FA-підтвердження входу,
 * lib/auth.ts). На відміну від sendNotification, кидає при збої — виклик
 * сам вирішує, що робити (напр. повернути 503 користувачу).
 */
export async function sendNotificationNow(recipientPersonId: number, templateKey: string, vars: Record<string, string>, replyMarkup?: unknown): Promise<void> {
  const text = await renderTemplate(templateKey, vars);
  const person = await prisma.person.findUnique({ where: { id: recipientPersonId } });

  if (!person?.telegramId) {
    await prisma.notification.create({
      data: { recipientId: recipientPersonId, templateKey, text, status: NotificationStatus.FAILED, error: "Немає прив'язаного Telegram" },
    });
    throw new Error("Немає прив'язаного Telegram");
  }

  try {
    await sendTelegramMessage(person.telegramId, text, replyMarkup);
    await prisma.notification.create({
      data: { recipientId: recipientPersonId, templateKey, text, status: NotificationStatus.SENT, sentAt: new Date() },
    });
  } catch (e) {
    await prisma.notification.create({
      data: { recipientId: recipientPersonId, templateKey, text, status: NotificationStatus.FAILED, error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
