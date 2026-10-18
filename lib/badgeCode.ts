import { randomInt } from "node:crypto";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { queueBadgeCodeDelivery } from "./notifications";

const BADGE_CODE_LENGTH = 10;

/** Випадкові цифри, перша не нуль — щоб код не "губив" нуль у сканерах/таблицях. */
function randomDigits(length: number): string {
  let code = String(randomInt(1, 10));
  for (let i = 1; i < length; i++) code += String(randomInt(0, 10));
  return code;
}

async function generateUniqueBadgeCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomDigits(BADGE_CODE_LENGTH);
    const taken = await prisma.person.findUnique({ where: { badgeCode: code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error("Не вдалося згенерувати унікальний код працівника");
}

/** Видає код, лише якщо його ще немає — ідемпотентно (seed, старт онбордингу). */
export async function ensureBadgeCode(personId: number): Promise<string> {
  const person = await prisma.person.findUniqueOrThrow({ where: { id: personId }, select: { badgeCode: true } });
  if (person.badgeCode) return person.badgeCode;

  const code = await generateUniqueBadgeCode();
  await prisma.person.update({ where: { id: personId }, data: { badgeCode: code, badgeCodeIssuedAt: new Date() } });
  return code;
}

/** Загублений бейдж — новий код, старий одразу перестає діяти (унікальний індекс). */
export async function reissueBadgeCode(personId: number, actorEmploymentId: number): Promise<string> {
  const code = await generateUniqueBadgeCode();
  await prisma.person.update({ where: { id: personId }, data: { badgeCode: code, badgeCodeIssuedAt: new Date() } });
  await logAudit({ actorId: actorEmploymentId, action: "badgeCode.reissued", entityType: "Person", entityId: personId });
  await queueBadgeCodeDelivery(personId);
  return code;
}
