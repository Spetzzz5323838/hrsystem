/**
 * Мінімальна відправка повідомлень у Telegram — прямий виклик Bot API,
 * без черги й ретраїв (pg-boss під це ще не піднятий, докс v1.md §8
 * планує чергу пізніше). Найкращий спосіб: помилка лише логується, не
 * кидається — відправка сповіщення ніколи не повинна ламати основну дію
 * (реєстрацію, призначення куратора тощо).
 */
export async function sendTelegramMessage(telegramId: bigint, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId.toString(), text }),
    });
    if (!response.ok) {
      console.error("sendTelegramMessage failed:", await response.text());
    }
  } catch (error) {
    console.error("sendTelegramMessage error:", error);
  }
}
