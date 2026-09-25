import { prisma } from "./prisma";
import { getCompetencyDelta } from "./competencies";
import { findAncestorPath } from "./permissions";
import { RatingType, Visibility, EmploymentStatus, OrgNodeType } from "../generated/prisma/client";

const LEVELS = [
  { min: 0, name: "Новачок" },
  { min: 25, name: "Впевнений" },
  { min: 60, name: "Надійний" },
  { min: 120, name: "Опора команди" },
];

/** ratingScore = сума points за останні 12 міс, без скасованих (docs v1.3 §1). */
export async function getRatingScore(personId: number): Promise<number> {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setUTCMonth(twelveMonthsAgo.getUTCMonth() - 12);

  const events = await prisma.ratingEvent.findMany({
    where: { personId, cancelledAt: null, occurredAt: { gte: twelveMonthsAgo } },
    select: { points: true },
  });
  return events.reduce((sum, e) => sum + e.points, 0);
}

export function getLevel(score: number): { name: string; min: number } {
  return [...LEVELS].reverse().find((l) => score >= l.min) ?? LEVELS[0];
}

export function getNextLevel(score: number): { name: string; min: number } | null {
  return LEVELS.find((l) => l.min > score) ?? null;
}

async function findEmployeeObjectPath(personId: number): Promise<string | null> {
  const employment = await prisma.employment.findFirst({
    where: { personId, status: { not: EmploymentStatus.TERMINATED } },
    include: { staffUnit: { include: { orgNode: true } } },
  });
  if (!employment) return null;
  return findAncestorPath(employment.staffUnit.orgNode.path, OrgNodeType.OBJECT);
}

export type CreateRatingEventInput = {
  personId: number;
  authorEmploymentId: number;
  type: "POSITIVE" | "NEGATIVE" | "REPRIMAND" | "AWARD";
  categoryCode?: string;
  comment?: string;
  badgeCode?: string;
  /** Потрібне, якщо це вже 3-й+ негатив цьому працівнику за тиждень (docs §2.2). */
  confirmedConversation?: boolean;
};

export type CreateRatingEventResult =
  | { ok: true; eventId: number }
  | { ok: false; error: string; needsConversationConfirmation?: boolean };

/**
 * Створює подію рейтингу з усіма правилами docs v1.3 §2.1-§2.2:
 * коментар обов'язковий для негативу й номінації, ліміт «одна номінація
 * НА КОЖНУ КАТЕГОРІЮ (бейдж) на місяць на об'єкт» (правки 20.09.2026,
 * п.14 — виправлений баг: раніше ліміт рахувався сумарно по всіх бейджах,
 * тож перша ж номінація місяця будь-якої категорії блокувала решту чотирьох
 * для всього об'єкта), підтвердження бесіди після 2+ негативів за тиждень.
 * AUTO-події тут не створюються — для них ще немає тригерів (окремий крок).
 */
export async function createRatingEvent(input: CreateRatingEventInput): Promise<CreateRatingEventResult> {
  const comment = input.comment?.trim() ?? "";

  if (input.type === "NEGATIVE" && comment.length < 3) {
    return { ok: false, error: "Коментар обов'язковий для негативу" };
  }
  if (input.type === "REPRIMAND" && comment.length < 3) {
    return { ok: false, error: "Коментар обов'язковий для догани" };
  }
  if (input.type === "AWARD" && (comment.length < 3 || !input.badgeCode)) {
    return { ok: false, error: "Для номінації потрібні бейдж і коментар" };
  }

  let points: number;
  let visibility: Visibility;
  let categoryCode: string | null = null;

  if (input.type === "POSITIVE" || input.type === "NEGATIVE") {
    if (!input.categoryCode) return { ok: false, error: "Потрібен привід із довідника" };
    const category = await prisma.ratingCategory.findUnique({ where: { code: input.categoryCode } });
    if (!category || !category.isActive) return { ok: false, error: "Невідомий або вимкнений привід" };
    const expectedSide = input.type === "POSITIVE" ? "POS" : "NEG";
    if (category.side !== expectedSide) return { ok: false, error: "Привід не відповідає типу події" };
    points = category.defaultPoints;
    visibility = Visibility.PRIVATE;
    categoryCode = category.code;
  } else if (input.type === "REPRIMAND") {
    points = -20;
    visibility = Visibility.EMPLOYEE;
  } else {
    points = 30;
    visibility = Visibility.PUBLIC;
  }

  if (input.type === "NEGATIVE") {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentNegatives = await prisma.ratingEvent.count({
      where: { personId: input.personId, type: RatingType.NEGATIVE, cancelledAt: null, occurredAt: { gte: weekAgo } },
    });
    if (recentNegatives >= 2 && !input.confirmedConversation) {
      return {
        ok: false,
        error: "Це вже третій негатив цьому працівнику за тиждень — підтвердіть, що бесіда з ним відбулася",
        needsConversationConfirmation: true,
      };
    }
  }

  if (input.type === "AWARD") {
    const objectPath = await findEmployeeObjectPath(input.personId);
    if (objectPath) {
      const startOfMonth = new Date();
      startOfMonth.setUTCDate(1);
      startOfMonth.setUTCHours(0, 0, 0, 0);

      // BadgeAward — окремий запис без FK на RatingEvent (див. створення
      // нижче), тож ліміт рахується напряму по ньому, не через RatingEvent.
      const nominationsThisMonth = await prisma.badgeAward.count({
        where: {
          badgeCode: input.badgeCode,
          awardedAt: { gte: startOfMonth },
          person: { employments: { some: { staffUnit: { orgNode: { path: objectPath } } } } },
        },
      });
      if (nominationsThisMonth > 0) {
        return { ok: false, error: "Ця номінація вже була видана на цей об'єкт цього місяця" };
      }
    }
  }

  const event = await prisma.ratingEvent.create({
    data: {
      personId: input.personId,
      type: input.type as RatingType,
      categoryCode,
      points,
      comment: comment || null,
      visibility,
      authorId: input.authorEmploymentId,
    },
  });

  if (input.type === "AWARD" && input.badgeCode) {
    await prisma.badgeAward.create({
      data: { personId: input.personId, badgeCode: input.badgeCode, awardedById: input.authorEmploymentId, comment },
    });
  }

  return { ok: true, eventId: event.id };
}

/** Скасувати можна тільки автору, протягом 48 год, з причиною. Редагування нема ніколи. */
export async function cancelRatingEvent(
  eventId: number,
  requestingEmploymentId: number,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const event = await prisma.ratingEvent.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, error: "Запис не знайдено" };
  if (event.cancelledAt) return { ok: false, error: "Уже скасовано" };
  if (event.authorId !== requestingEmploymentId) return { ok: false, error: "Скасувати може тільки автор запису" };

  const hoursSince = (Date.now() - event.occurredAt.getTime()) / (1000 * 60 * 60);
  if (hoursSince > 48) return { ok: false, error: "Минуло більше 48 годин — скасування вже недоступне" };
  if (!reason.trim()) return { ok: false, error: "Потрібна причина скасування" };

  await prisma.ratingEvent.update({
    where: { id: eventId },
    data: { cancelledAt: new Date(), cancelReason: reason.trim() },
  });
  return { ok: true };
}

/**
 * Єдине автоматичне правило бейджів, яке реально рахую зараз: "Профіль
 * закрито" — усі компетенції посади чинні (є готовий getCompetencyDelta).
 * Решта isAuto-бейджів у докс (стаж, "без зауважень" тощо) — тільки
 * довідник, тригера ще немає.
 */
export async function checkProfileClosedBadge(personId: number): Promise<boolean> {
  const employment = await prisma.employment.findFirst({
    where: { personId, status: { not: EmploymentStatus.TERMINATED } },
    include: { staffUnit: true },
  });
  if (!employment) return false;

  const delta = await getCompetencyDelta(personId, employment.staffUnit.positionProfileId);
  if (!delta.length || delta.some((d) => d.state !== "valid")) return false;

  const existing = await prisma.badgeAward.findFirst({ where: { personId, badgeCode: "profile_closed" } });
  if (existing) return true;

  await prisma.badgeAward.create({ data: { personId, badgeCode: "profile_closed", awardedById: null } });
  return true;
}

/**
 * "Понад профіль" — складено хоч одну бонусну компетенцію (isBonus).
 * Викликається з lib/onboarding.ts після будь-якого запису CompetencyRecord.
 */
export async function checkBeyondProfileBadge(personId: number): Promise<boolean> {
  const existing = await prisma.badgeAward.findFirst({ where: { personId, badgeCode: "beyond_profile" } });
  if (existing) return true;

  const now = new Date();
  const bonusRecord = await prisma.competencyRecord.findFirst({
    where: { personId, competency: { isBonus: true }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
  });
  if (!bonusRecord) return false;

  await prisma.badgeAward.create({ data: { personId, badgeCode: "beyond_profile", awardedById: null } });
  return true;
}

/**
 * "Швидкий старт" — атестація з першого разу. Механізм атестації зараз
 * не відстежує провал/повторні спроби (docs catalogs-v1.1 §7 — окремий,
 * більший крок), тож кожне складання технічно й є єдиною ("першою")
 * спробою — награда чесна відносно того, що система реально фіксує.
 */
export async function checkFastStartBadge(personId: number): Promise<boolean> {
  const existing = await prisma.badgeAward.findFirst({ where: { personId, badgeCode: "fast_start" } });
  if (existing) return true;

  await prisma.badgeAward.create({ data: { personId, badgeCode: "fast_start", awardedById: null } });
  return true;
}

/**
 * "Наставник" — троє стажерів склали атестацію з першого разу під цим
 * куратором. Рахує підопічних (Employment.curatorId) по всіх
 * працевлаштуваннях людини-куратора, дивиться, скільком із них уже
 * нараховано fast_start.
 */
export async function checkMentorBadge(curatorEmploymentId: number): Promise<boolean> {
  const curatorEmployment = await prisma.employment.findUnique({ where: { id: curatorEmploymentId } });
  if (!curatorEmployment) return false;

  const existing = await prisma.badgeAward.findFirst({ where: { personId: curatorEmployment.personId, badgeCode: "mentor" } });
  if (existing) return true;

  const curatorEmploymentIds = (
    await prisma.employment.findMany({ where: { personId: curatorEmployment.personId }, select: { id: true } })
  ).map((e) => e.id);

  const trainees = await prisma.employment.findMany({
    where: { curatorId: { in: curatorEmploymentIds } },
    select: { personId: true },
  });
  const traineePersonIds = [...new Set(trainees.map((t) => t.personId))];
  if (!traineePersonIds.length) return false;

  const fastStartCount = await prisma.badgeAward.count({
    where: { badgeCode: "fast_start", personId: { in: traineePersonIds } },
  });
  if (fastStartCount < 3) return false;

  await prisma.badgeAward.create({ data: { personId: curatorEmployment.personId, badgeCode: "mentor", awardedById: null } });
  return true;
}
