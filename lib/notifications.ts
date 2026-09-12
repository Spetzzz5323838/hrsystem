import { getBoss } from "./queue";
import { sendTelegramMessage } from "./telegram";

export const TELEGRAM_MESSAGE_QUEUE = "telegram-message";

type TelegramMessageJob = { telegramId: string; text: string };

/**
 * Кладе повідомлення в чергу замість прямої відправки — pg-boss дає
 * повтори при збої (докс plan-v1.md §8: "Кожне відправлення пишеться в
 * Notification зі статусом, ретраї через pg-boss"). Викликати можна і з
 * веб-процесу (Next.js), і з бота — обробляє джоби тільки бот
 * (registerTelegramMessageWorker), бо саме там живе Bot API клієнт.
 */
export async function queueTelegramMessage(telegramId: bigint, text: string): Promise<void> {
  const boss = await getBoss();
  await boss.createQueue(TELEGRAM_MESSAGE_QUEUE);
  await boss.send(TELEGRAM_MESSAGE_QUEUE, { telegramId: telegramId.toString(), text } satisfies TelegramMessageJob, {
    retryLimit: 5,
    retryBackoff: true,
  });
}

/** Викликати один раз при старті бота. */
export async function registerTelegramMessageWorker(): Promise<void> {
  const boss = await getBoss();
  await boss.createQueue(TELEGRAM_MESSAGE_QUEUE);
  await boss.work<TelegramMessageJob>(TELEGRAM_MESSAGE_QUEUE, async (jobs) => {
    for (const job of jobs) {
      await sendTelegramMessage(BigInt(job.data.telegramId), job.data.text);
    }
  });
}
