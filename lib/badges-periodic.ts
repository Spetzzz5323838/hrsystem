import { prisma } from "./prisma";
import { EmploymentStatus, RatingType } from "../generated/prisma/client";

const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * "Без зауважень" — півроку без негативних відміток. Викликається
 * щодоби з pg-boss (bot/index.ts), не подієво: відсутність події не
 * викликає обробник сама по собі.
 */
export async function checkCleanStreakBadge(personId: number): Promise<boolean> {
  const existing = await prisma.badgeAward.findFirst({ where: { personId, badgeCode: "clean_streak" } });
  if (existing) return true;

  const employment = await prisma.employment.findFirst({ where: { personId, status: { not: EmploymentStatus.TERMINATED } } });
  if (!employment?.hiredAt) return false;

  const sixMonthsAgo = new Date(Date.now() - SIX_MONTHS_MS);
  if (employment.hiredAt > sixMonthsAgo) return false;

  const negative = await prisma.ratingEvent.findFirst({
    where: { personId, type: RatingType.NEGATIVE, cancelledAt: null, occurredAt: { gt: sixMonthsAgo } },
  });
  if (negative) return false;

  await prisma.badgeAward.create({ data: { personId, badgeCode: "clean_streak", awardedById: null } });
  return true;
}

/**
 * "Завжди в строю" — рік без протермінованого документа чи компетенції.
 * Свідоме спрощення: перевіряє тільки ПОТОЧНИЙ стан (зараз нічого не
 * протерміновано), не історію за 12 місяців — минулих протермінувань
 * система не зберігає (тільки поточні validUntil/expiresAt), тож "жодного
 * разу за рік" точно не перевірити без окремого журналу подій.
 */
export async function checkAlwaysCurrentBadge(personId: number): Promise<boolean> {
  const existing = await prisma.badgeAward.findFirst({ where: { personId, badgeCode: "always_current" } });
  if (existing) return true;

  const employment = await prisma.employment.findFirst({ where: { personId, status: { not: EmploymentStatus.TERMINATED } } });
  if (!employment?.hiredAt) return false;

  const oneYearAgo = new Date(Date.now() - ONE_YEAR_MS);
  if (employment.hiredAt > oneYearAgo) return false;

  const now = new Date();
  const expiredCompetency = await prisma.competencyRecord.findFirst({ where: { personId, validUntil: { lt: now } } });
  if (expiredCompetency) return false;

  const expiredDocument = await prisma.document.findFirst({ where: { personId, expiresAt: { lt: now } } });
  if (expiredDocument) return false;

  await prisma.badgeAward.create({ data: { personId, badgeCode: "always_current", awardedById: null } });
  return true;
}

const TENURE_MILESTONES: { years: number; comment: string }[] = [
  { years: 1, comment: "1 рік" },
  { years: 3, comment: "3 роки" },
  { years: 5, comment: "5 років" },
];

/**
 * "Стаж" — за датою прийому. Свідоме спрощення: без урахування перерв
 * (заморозки) — Employment не накопичує сумарну кількість днів у
 * заморозці на рівні всього періоду роботи (тільки CompetencyRecord
 * має frozenDays, і то per-компетенція), тож рахуємо календарний стаж
 * від hiredAt як є.
 */
export async function checkTenureBadge(personId: number): Promise<void> {
  const employment = await prisma.employment.findFirst({ where: { personId, status: { not: EmploymentStatus.TERMINATED } } });
  if (!employment?.hiredAt) return;

  const now = new Date();
  for (const milestone of TENURE_MILESTONES) {
    const threshold = new Date(employment.hiredAt);
    threshold.setFullYear(threshold.getFullYear() + milestone.years);
    if (threshold > now) continue;

    const existing = await prisma.badgeAward.findFirst({ where: { personId, badgeCode: "tenure", comment: milestone.comment } });
    if (existing) continue;

    await prisma.badgeAward.create({ data: { personId, badgeCode: "tenure", comment: milestone.comment, awardedById: null } });
  }
}

/** Проганяє всі три періодичні перевірки для кожного не звільненого працівника. */
export async function runPeriodicBadgeChecks(): Promise<void> {
  const employments = await prisma.employment.findMany({
    where: { status: { not: EmploymentStatus.TERMINATED } },
    select: { personId: true },
    distinct: ["personId"],
  });

  for (const { personId } of employments) {
    await checkCleanStreakBadge(personId);
    await checkAlwaysCurrentBadge(personId);
    await checkTenureBadge(personId);
  }
}
