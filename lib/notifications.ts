import { prisma } from "./prisma";
import { getBoss } from "./queue";
import { sendTelegramMessage } from "./telegram";
import { NotificationStatus } from "../generated/prisma/client";

export const TELEGRAM_MESSAGE_QUEUE = "telegram-message";
export const ONEC_PASSWORD_DELIVERY_QUEUE = "onec-password-delivery";

type TelegramMessageJob = { telegramId: string; text: string; replyMarkup?: unknown; notificationId?: number };
type OnecPasswordDeliveryJob = { employmentId: number };

/**
 * Кладе повідомлення в чергу замість прямої відправки — pg-boss дає
 * повтори при збої (докс plan-v1.md §8: "Кожне відправлення пишеться в
 * Notification зі статусом, ретраї через pg-boss"). Викликати можна і з
 * веб-процесу (Next.js), і з бота — обробляє джоби тільки бот
 * (registerTelegramMessageWorker), бо саме там живе Bot API клієнт.
 * `replyMarkup` — напр. inline-кнопка (docs v1.3 §4: підтвердження
 * ознайомлення з квартальною оцінкою). `notificationId` — рядок у
 * Notification, який воркер оновить статусом після спроби відправки
 * (lib/notificationTemplates.ts::sendNotification); без нього (прямі
 * виклики поза шаблонами) воркер просто шле й нічого не оновлює.
 */
export async function queueTelegramMessage(telegramId: bigint, text: string, replyMarkup?: unknown, notificationId?: number): Promise<void> {
  const boss = await getBoss();
  await boss.createQueue(TELEGRAM_MESSAGE_QUEUE);
  await boss.send(TELEGRAM_MESSAGE_QUEUE, { telegramId: telegramId.toString(), text, replyMarkup, notificationId } satisfies TelegramMessageJob, {
    retryLimit: 5,
    retryBackoff: true,
  });
}

/**
 * У чергу кладеться лише employmentId, не сам пароль і не готова картинка
 * — розшифрування й генерація штрихкода відбуваються заново в
 * lib/onecPassword.ts::deliverOnecPassword, безпосередньо перед
 * відправкою (воркер зареєстрований у bot/index.ts, бо там же й
 * Bot API — той самий принцип, що й для щоденних перевірок бейджів/SLA).
 */
export async function queueOnecPasswordDelivery(employmentId: number): Promise<void> {
  const boss = await getBoss();
  await boss.createQueue(ONEC_PASSWORD_DELIVERY_QUEUE);
  await boss.send(ONEC_PASSWORD_DELIVERY_QUEUE, { employmentId } satisfies OnecPasswordDeliveryJob, {
    retryLimit: 5,
    retryBackoff: true,
  });
}

/**
 * Викликати один раз при старті бота. `status` тут — "поточний відомий
 * стан", не "остаточний": FAILED після вичерпання ретраїв pg-boss ще раз
 * не позначається окремо (ретраї відбуваються тим самим шляхом) — якщо
 * наступна спроба вдасться, рядок перепишеться на SENT.
 */
export async function registerTelegramMessageWorker(): Promise<void> {
  const boss = await getBoss();
  await boss.createQueue(TELEGRAM_MESSAGE_QUEUE);
  await boss.work<TelegramMessageJob>(TELEGRAM_MESSAGE_QUEUE, async (jobs) => {
    for (const job of jobs) {
      try {
        await sendTelegramMessage(BigInt(job.data.telegramId), job.data.text, job.data.replyMarkup);
        if (job.data.notificationId) {
          await prisma.notification.update({
            where: { id: job.data.notificationId },
            data: { status: NotificationStatus.SENT, sentAt: new Date(), error: null },
          });
        }
      } catch (e) {
        if (job.data.notificationId) {
          await prisma.notification.update({
            where: { id: job.data.notificationId },
            data: { status: NotificationStatus.FAILED, error: e instanceof Error ? e.message : String(e) },
          });
        }
        throw e; // хай pg-boss ретраїть як і раніше
      }
    }
  });
}
