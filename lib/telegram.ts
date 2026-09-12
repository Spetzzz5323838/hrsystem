/**
 * Прямий виклик Bot API. Кидає при збої — навмисно: єдиний виклик
 * тепер усередині pg-boss-воркера (lib/notifications.ts), де кинута
 * помилка — це сигнал ретраю, а не збій дії користувача. Ніде більше
 * цю функцію напряму викликати не варто (звідти виклик обійде чергу й
 * повтори) — для відправки з коду використовуй queueTelegramMessage.
 */
export async function sendTelegramMessage(telegramId: bigint, text: string, replyMarkup?: unknown): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: telegramId.toString(), text, reply_markup: replyMarkup }),
  });
  if (!response.ok) {
    throw new Error(`sendTelegramMessage failed: ${await response.text()}`);
  }
}
