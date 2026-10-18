import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { generateBarcodePng } from "./barcode";
import { queueBadgeCodeDelivery } from "./notifications";
import { sendTelegramPhoto } from "./telegram";
import { ensureBadgeCode } from "./badgeCode";
import { completeTask, getInstanceTasks } from "./onboarding";
import { TaskStatus } from "../generated/prisma/client";

/**
 * Крок онбордингу "Генерація коду працівника": новий (автоматичний) і старі,
 * що лишилися в уже запущених процесах (шаблони до v7). Окремого пароля до
 * каси немає (рішення власника 2026-10-18): на касі вводиться той самий код.
 */
export const CREDENTIALS_STEP_TITLES = [
  "Генерація коду працівника",
  "Генерація коду працівника і пароля до каси",
  "Реєстрація в 1С, генерація пароля",
];

/** Видає код (якщо ще немає) і надсилає його штрихкодом у Telegram. */
export async function issueOnboardingCredentials(employmentId: number): Promise<void> {
  const employment = await prisma.employment.findUniqueOrThrow({ where: { id: employmentId } });
  await ensureBadgeCode(employment.personId);
  await queueBadgeCodeDelivery(employment.personId);
}

/**
 * Старий крок "Реєстрація в 1С, генерація пароля" у вже запущених
 * онбордингах — генерує код і закриває крок, щоб ці процеси не застрягли.
 */
export async function completeCredentialsTask(taskId: number, actorEmploymentId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { instance: true } });
  if (!task) return { ok: false, error: "Задачу не знайдено" };
  if (task.status === TaskStatus.DONE) return { ok: false, error: "Уже виконано" };

  const view = (await getInstanceTasks(task.instanceId)).find((t) => t.taskId === taskId);
  if (view?.blocked) return { ok: false, error: "Заблоковано попереднім пунктом" };

  await issueOnboardingCredentials(task.instance.employmentId);
  return completeTask(taskId, actorEmploymentId);
}

/**
 * Воркер черги (bot/index.ts) — штрихкод генерується заново безпосередньо
 * перед відправкою й ніде не зберігається.
 */
export async function deliverBadgeCode(personId: number): Promise<void> {
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person?.badgeCode || !person.telegramId) return;

  const barcode = await generateBarcodePng(person.badgeCode);
  await sendTelegramPhoto(
    person.telegramId,
    barcode,
    `Ваш код працівника: ${person.badgeCode}\nЦе штрихкод вашого бейджа: ним відмічаєтесь на терміналі й реєструєтесь на касі. Нікому його не показуйте й не пересилайте. Якщо загубили — зверніться до адміністратора.`,
  );
  await logAudit({ actorId: null, action: "badgeCode.shown", entityType: "Person", entityId: personId });
}
