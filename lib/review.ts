import { prisma } from "./prisma";
import { queueTelegramMessage } from "./notifications";
import { ReviewCriterion } from "../generated/prisma/client";

export const REVIEW_CRITERIA: ReviewCriterion[] = ["QUALITY", "RELIABILITY", "PACE", "TEAM", "CLIENT", "INITIATIVE"];

export const REVIEW_CRITERION_LABELS: Record<ReviewCriterion, string> = {
  QUALITY: "Якість роботи",
  RELIABILITY: "Надійність",
  PACE: "Темп",
  TEAM: "Команда",
  CLIENT: "Клієнт",
  INITIATIVE: "Ініціатива й розвиток",
};

/**
 * Ваги критеріїв для посади (docs v1.3 §4). Рядок відсутній для
 * критерію = вага за замовчуванням 1 (порівну з рештою) — редактор у
 * /catalog (`canManageTemplates`) пише в ReviewCriterionWeight через
 * PATCH /api/position-profiles/[id]/review-weights.
 */
export async function getWeights(positionProfileId: number): Promise<Record<ReviewCriterion, number>> {
  const rows = await prisma.reviewCriterionWeight.findMany({ where: { positionProfileId } });
  const byCriterion = new Map(rows.map((r) => [r.criterion, r.weight]));
  const weights = {} as Record<ReviewCriterion, number>;
  for (const c of REVIEW_CRITERIA) weights[c] = byCriterion.get(c) ?? 1;
  return weights;
}

export type CreateReviewInput = { year: number; quarter: number; scores: { criterion: ReviewCriterion; score: number }[] };

export async function createReview(
  employmentId: number,
  input: CreateReviewInput,
  createdByEmploymentId: number,
): Promise<{ ok: true; reviewId: number } | { ok: false; error: string }> {
  if (input.quarter < 1 || input.quarter > 4) return { ok: false, error: "Квартал має бути від 1 до 4" };
  if (input.scores.length !== REVIEW_CRITERIA.length || REVIEW_CRITERIA.some((c) => !input.scores.some((s) => s.criterion === c))) {
    return { ok: false, error: "Потрібно оцінити всі 6 критеріїв" };
  }
  for (const s of input.scores) {
    if (!Number.isInteger(s.score) || s.score < 1 || s.score > 5) {
      return { ok: false, error: "Кожен критерій — ціле число від 1 до 5" };
    }
  }

  const employment = await prisma.employment.findUnique({ where: { id: employmentId }, include: { staffUnit: true } });
  if (!employment) return { ok: false, error: "Працівника не знайдено" };

  const weights = await getWeights(employment.staffUnit.positionProfileId);
  const weightSum = REVIEW_CRITERIA.reduce((sum, c) => sum + weights[c], 0);
  const weightedScore = input.scores.reduce((sum, s) => sum + s.score * weights[s.criterion], 0) / weightSum;

  try {
    const review = await prisma.review.create({
      data: {
        employmentId,
        year: input.year,
        quarter: input.quarter,
        weightedScore,
        createdById: createdByEmploymentId,
        scores: { create: input.scores.map((s) => ({ criterion: s.criterion, score: s.score, weight: weights[s.criterion] })) },
      },
    });
    return { ok: true, reviewId: review.id };
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return { ok: false, error: "Оцінка за цей квартал уже є" };
    }
    throw error;
  }
}

/**
 * "Публікація" (docs v1.3 §4): результат не видимий працівнику, доки
 * керівник тут не зафіксує, що бесіда відбулася. Тільки в цей момент
 * іде Telegram-повідомлення з кнопкою підтвердження — раніше немає сенсу,
 * розмова ще не сталася.
 */
export async function confirmConversation(
  reviewId: number,
  confirmedByEmploymentId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { employment: { include: { person: true } } },
  });
  if (!review) return { ok: false, error: "Оцінку не знайдено" };
  if (review.conversationConfirmedAt) return { ok: false, error: "Уже підтверджено" };

  await prisma.review.update({
    where: { id: reviewId },
    data: { conversationConfirmedAt: new Date(), conversationConfirmedById: confirmedByEmploymentId },
  });

  if (review.employment.person.telegramId) {
    await queueTelegramMessage(
      review.employment.person.telegramId,
      `У вас квартальна оцінка за ${review.quarter} квартал ${review.year}. Обговоріть її з керівником, якщо ще не встигли, і підтвердьте ознайомлення нижче.`,
      { inline_keyboard: [[{ text: "Ознайомлений(-а)", callback_data: `review_ack:${review.id}` }]] },
    );
  }

  return { ok: true };
}

export type ReviewSummary = {
  id: number;
  year: number;
  quarter: number;
  weightedScore: number;
  confirmed: boolean;
  acknowledged: boolean;
};

/** Для бота: підтвердити ознайомлення (тільки сам працівник, і тільки після публікації). */
export async function acknowledgeReview(reviewId: number, telegramId: bigint): Promise<{ ok: true; summary: ReviewSummary[] } | { ok: false; error: string }> {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { employment: { include: { person: true } } },
  });
  if (!review) return { ok: false, error: "Оцінку не знайдено" };
  if (review.employment.person.telegramId !== telegramId) return { ok: false, error: "Це не ваша оцінка" };
  if (!review.conversationConfirmedAt) return { ok: false, error: "Оцінка ще не опублікована" };

  if (!review.employeeAcknowledgedAt) {
    await prisma.review.update({ where: { id: reviewId }, data: { employeeAcknowledgedAt: new Date() } });
  }

  const history = await getReviewHistory(review.employmentId);
  return { ok: true, summary: history };
}

/** Динаміка по кварталах — лише опубліковані (docs: "тільки свою оцінку й свою динаміку"). */
export async function getReviewHistory(employmentId: number): Promise<ReviewSummary[]> {
  const reviews = await prisma.review.findMany({
    where: { employmentId, conversationConfirmedAt: { not: null } },
    orderBy: [{ year: "asc" }, { quarter: "asc" }],
  });
  return reviews.map((r) => ({
    id: r.id,
    year: r.year,
    quarter: r.quarter,
    weightedScore: r.weightedScore,
    confirmed: true,
    acknowledged: !!r.employeeAcknowledgedAt,
  }));
}
