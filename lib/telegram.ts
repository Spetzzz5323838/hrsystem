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

/**
 * Файл матеріалу (PDF, докс plan-v1.md §9.1: "PDF можна й через бот") —
 * реальний файл із диска сервера, не посилання (спрощення 2026-09-25:
 * простий користувач більше не пише URL). Той самий принцип "кидає при
 * збої", що й sendTelegramMessage — виклик тільки всередині pg-boss-воркера.
 */
export async function sendTelegramDocument(telegramId: bigint, file: Buffer, filename: string, caption: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const form = new FormData();
  form.append("chat_id", telegramId.toString());
  form.append("caption", caption);
  form.append("document", new Blob([new Uint8Array(file)]), filename);

  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error(`sendTelegramDocument failed: ${await response.text()}`);
  }
}

/**
 * Картинка (штрихкод пароля 1С, docs plan-v1.md §8/§14) з
 * `protect_content: true` — Telegram блокує пересилання й збереження
 * повідомлення. Той самий принцип "кидає при збої", що й sendTelegramMessage
 * — виклик тільки всередині pg-boss-воркера.
 */
export async function sendTelegramPhoto(telegramId: bigint, photo: Buffer, caption: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const form = new FormData();
  form.append("chat_id", telegramId.toString());
  form.append("caption", caption);
  form.append("protect_content", "true");
  form.append("photo", new Blob([new Uint8Array(photo)], { type: "image/png" }), "barcode.png");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error(`sendTelegramPhoto failed: ${await response.text()}`);
  }
}
