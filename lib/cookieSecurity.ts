/**
 * Чи ставити cookie з прапорцем Secure (браузер тоді приймає їх лише по https).
 * Система працює в локальній мережі, де сайт відкривається по http, тож у
 * бойовому режимі це вимикається змінною COOKIE_SECURE=false у .env.
 * Без змінної: Secure — лише в production.
 */
export function cookieSecure(): boolean {
  const flag = process.env.COOKIE_SECURE;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV === "production";
}
