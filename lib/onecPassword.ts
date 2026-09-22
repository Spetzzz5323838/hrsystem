import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { encryptSecret, decryptSecret } from "./crypto";
import { generateBarcodePng } from "./barcode";
import { queueOnecPasswordDelivery } from "./notifications";
import { sendTelegramPhoto } from "./telegram";
import { completeTask, getInstanceTasks } from "./onboarding";
import { TaskStatus } from "../generated/prisma/client";

/**
 * Пункт чек-ліста "Реєстрація в 1С, генерація пароля" (docs plan-v1.md
 * §8, п.5): оператор 1С вводить пароль, який видала зовнішня 1С —
 * система лише шифрує й контрольовано передає його далі. Обгортка над
 * completeTask (той самий принцип, що й completeCuratorAssignmentTask).
 */
export async function setOnecPassword(
  taskId: number,
  password: string,
  actorEmploymentId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!password || password.trim().length < 4) return { ok: false, error: "Пароль закороткий" };

  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { instance: true } });
  if (!task) return { ok: false, error: "Задачу не знайдено" };
  if (task.status === TaskStatus.DONE) return { ok: false, error: "Уже виконано" };

  // Той самий гейт, що на початку completeTask — ПЕРЕД записом пароля й
  // постановкою джоби доставки штрихкода в чергу, а не лише всередині
  // фінального completeTask(taskId, ...) у кінці функції (той самий клас
  // бага, що виправлено 2026-09-22 в completeCuratorAssignmentTask).
  const tasksInInstance = await getInstanceTasks(task.instanceId);
  const thisView = tasksInInstance.find((t) => t.taskId === taskId);
  if (thisView?.blocked) return { ok: false, error: "Заблоковано попереднім пунктом" };

  const employmentId = task.instance.employmentId;

  await prisma.employment.update({
    where: { id: employmentId },
    data: { onecPasswordCipher: encryptSecret(password.trim()), onecPasswordSetAt: new Date() },
  });

  await logAudit({ actorId: actorEmploymentId, action: "onec.passwordSet", entityType: "Employment", entityId: employmentId });
  await queueOnecPasswordDelivery(employmentId);

  return completeTask(taskId, actorEmploymentId);
}

/**
 * Перевидача (docs: "перевидача — тільки ONEC_ADMIN") — доступна в будь-
 * який момент після онбордингу, не прив'язана до чек-ліста. Гейт
 * SET_1C_PASSWORD перевіряється в API-роуті, не тут.
 */
export async function reissueOnecPassword(
  employmentId: number,
  password: string,
  actorEmploymentId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!password || password.trim().length < 4) return { ok: false, error: "Пароль закороткий" };

  const employment = await prisma.employment.findUnique({ where: { id: employmentId } });
  if (!employment) return { ok: false, error: "Працевлаштування не знайдено" };

  await prisma.employment.update({
    where: { id: employmentId },
    data: { onecPasswordCipher: encryptSecret(password.trim()), onecPasswordSetAt: new Date() },
  });

  await logAudit({ actorId: actorEmploymentId, action: "onec.passwordReissued", entityType: "Employment", entityId: employmentId });
  await queueOnecPasswordDelivery(employmentId);

  return { ok: true };
}

/**
 * Викликається воркером черги (bot/index.ts, ONEC_PASSWORD_DELIVERY_QUEUE)
 * — розшифровує й генерує штрихкод щоразу заново, безпосередньо перед
 * відправкою; ні пароль, ні картинка ніде між викликами не зберігаються.
 */
export async function deliverOnecPassword(employmentId: number): Promise<void> {
  const employment = await prisma.employment.findUnique({ where: { id: employmentId }, include: { person: true } });
  if (!employment?.onecPasswordCipher || !employment.person.telegramId) return;

  const password = decryptSecret(employment.onecPasswordCipher);
  const barcode = await generateBarcodePng(password);

  await sendTelegramPhoto(
    employment.person.telegramId,
    barcode,
    "Ваш пароль для входу в 1С і на касі. Відскануйте штрихкод на терміналі під час першого входу. Нікому його не показуйте й не пересилайте.",
  );

  await logAudit({ actorId: null, action: "onec.passwordShown", entityType: "Employment", entityId: employmentId });
}
