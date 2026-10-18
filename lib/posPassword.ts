import { randomInt } from "node:crypto";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { encryptSecret, decryptSecret } from "./crypto";
import { generateBarcodePng } from "./barcode";
import { queuePosPasswordDelivery } from "./notifications";
import { sendTelegramPhoto } from "./telegram";
import { ensureBadgeCode } from "./badgeCode";
import { completeTask, getInstanceTasks } from "./onboarding";
import { TaskStatus } from "../generated/prisma/client";

// Каса приймає лише цифри, не більше 16 (уточнення власника 2026-10-18).
const POS_PASSWORD_LENGTH = 8;

/** Крок онбордингу: новий "автоматичний" і старий, що лишився в уже запущених процесах (шаблон до v6). */
export const CREDENTIALS_STEP_TITLES = ["Генерація коду працівника і пароля до каси", "Реєстрація в 1С, генерація пароля"];

function randomDigits(length: number): string {
  let code = "";
  for (let i = 0; i < length; i++) code += String(randomInt(0, 10));
  return code;
}

/**
 * Новий пароль до каси (2026-10-18: генерує система, а не оператор 1С).
 * Старий одразу перезаписується — сам факт перевидачі робить його
 * недійсним у системі; на касі його треба замінити вручну. Доставка —
 * штрихкодом у Telegram через чергу, як і раніше.
 */
export async function issuePosPassword(
  employmentId: number,
  actorEmploymentId: number | null,
  action: "posPassword.issued" | "posPassword.reissued",
): Promise<void> {
  await prisma.employment.update({
    where: { id: employmentId },
    data: { posPasswordCipher: encryptSecret(randomDigits(POS_PASSWORD_LENGTH)), posPasswordSetAt: new Date() },
  });
  await logAudit({ actorId: actorEmploymentId, action, entityType: "Employment", entityId: employmentId });
  await queuePosPasswordDelivery(employmentId);
}

/** Код працівника — усім; пароль до каси — лише посадам з касою (requiresCashierAccount). */
export async function issueOnboardingCredentials(employmentId: number, actorEmploymentId: number | null): Promise<void> {
  const employment = await prisma.employment.findUniqueOrThrow({
    where: { id: employmentId },
    include: { staffUnit: { include: { positionProfile: true } } },
  });
  await ensureBadgeCode(employment.personId);
  if (employment.staffUnit.positionProfile.requiresCashierAccount) {
    await issuePosPassword(employmentId, actorEmploymentId, "posPassword.issued");
  }
}

/**
 * Старий крок "Реєстрація в 1С, генерація пароля" у вже запущених
 * онбордингах (до нової версії шаблону) — замість ручного введення пароля
 * тепер просто генерує дані й закриває крок, щоб ці процеси не застрягли.
 */
export async function completeCredentialsTask(taskId: number, actorEmploymentId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { instance: true } });
  if (!task) return { ok: false, error: "Задачу не знайдено" };
  if (task.status === TaskStatus.DONE) return { ok: false, error: "Уже виконано" };

  const view = (await getInstanceTasks(task.instanceId)).find((t) => t.taskId === taskId);
  if (view?.blocked) return { ok: false, error: "Заблоковано попереднім пунктом" };

  await issueOnboardingCredentials(task.instance.employmentId, actorEmploymentId);
  return completeTask(taskId, actorEmploymentId);
}

/**
 * Воркер черги (bot/index.ts) — розшифровує й генерує штрихкод щоразу
 * заново, безпосередньо перед відправкою; ні пароль, ні картинка ніде між
 * викликами не зберігаються.
 */
export async function deliverPosPassword(employmentId: number): Promise<void> {
  const employment = await prisma.employment.findUnique({ where: { id: employmentId }, include: { person: true } });
  if (!employment?.posPasswordCipher || !employment.person.telegramId) return;

  const password = decryptSecret(employment.posPasswordCipher);
  const barcode = await generateBarcodePng(password);

  await sendTelegramPhoto(
    employment.person.telegramId,
    barcode,
    "Ваш пароль до каси. Покажіть цей штрихкод під час реєстрації на касі. Нікому його не показуйте й не пересилайте. Якщо загубили — зверніться до адміністратора.",
  );

  await logAudit({ actorId: null, action: "posPassword.shown", entityType: "Employment", entityId: employmentId });
}
