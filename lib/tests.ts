import { randomInt } from "node:crypto";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { completeTask, resolveAssignee } from "./onboarding";
import { findActiveEmployment } from "./training";
import { sendNotification } from "./notificationTemplates";
import { checkProfileClosedBadge, checkBeyondProfileBadge } from "./rating";
import { ActionType, CompetencySource, Role, TaskStatus } from "../generated/prisma/client";

/**
 * Тести компетенцій (2026-11-05). Знання перевіряє тест у Telegram, практику, як і
 * раніше, оцінює атестатор. Одна правильна відповідь; результат у відсотках:
 * від 90% — 2 бали, від 80% — 1 бал (зараховано), нижче — 0. Правильні відповіді
 * працівнику не показуються. Спроб скільки завгодно, пауза між ними 1 година,
 * після кожних 3 невдач поспіль адміністратор отримує сповіщення.
 */
const ATTEMPT_EXPIRES_MS = 24 * 60 * 60 * 1000;
const MAX_OPTIONS = 6;

export const DEFAULT_TEST_SETTINGS = { isActive: true, questionsPerAttempt: null as number | null, passPercent: 80, excellentPercent: 90, pauseMinutes: 60, notifyAfterFails: 3 };

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ───────────── Конструктор: налаштування й питання ───────────── */

export type QuestionInput = { text: string; options: string[]; correctIndex: number };

export function validateQuestion(input: Partial<QuestionInput>): { ok: true; value: QuestionInput } | { ok: false; error: string } {
  const text = (input.text ?? "").trim();
  if (text.length < 3) return { ok: false, error: "Напишіть текст питання" };
  if (text.length > 600) return { ok: false, error: "Питання задовге (максимум 600 символів)" };
  const options = (input.options ?? []).map((o) => String(o).trim());
  if (options.length < 2 || options.length > MAX_OPTIONS) return { ok: false, error: `Потрібно від 2 до ${MAX_OPTIONS} варіантів відповіді` };
  if (options.some((o) => !o)) return { ok: false, error: "Варіанти відповіді не можуть бути порожніми" };
  if (options.some((o) => o.length > 200)) return { ok: false, error: "Варіант відповіді задовгий (максимум 200 символів)" };
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { ok: false, error: "Варіанти відповіді не повинні повторюватись" };
  const correctIndex = Number(input.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return { ok: false, error: "Позначте правильну відповідь" };
  return { ok: true, value: { text, options, correctIndex } };
}

export async function getTestOverview() {
  const competencies = await prisma.competency.findMany({
    orderBy: { name: "asc" },
    include: { test: true, _count: { select: { testQuestions: { where: { isActive: true } }, positionCompetencies: true } } },
  });
  return competencies.map((c) => ({
    competencyId: c.id,
    name: c.name,
    category: c.category,
    activeQuestions: c._count.testQuestions,
    testActive: c.test ? c.test.isActive : false,
    positionsUsing: c._count.positionCompetencies,
  }));
}

export async function getTestEditor(competencyId: number) {
  const competency = await prisma.competency.findUnique({ where: { id: competencyId }, include: { test: true } });
  if (!competency) return null;
  const questions = await prisma.testQuestion.findMany({
    where: { competencyId },
    orderBy: [{ isActive: "desc" }, { id: "asc" }],
    include: { _count: { select: { answers: true } } },
  });
  const s = competency.test ?? { ...DEFAULT_TEST_SETTINGS };
  return {
    competency: { id: competency.id, name: competency.name },
    settings: { isActive: s.isActive, questionsPerAttempt: s.questionsPerAttempt, passPercent: s.passPercent, excellentPercent: s.excellentPercent, pauseMinutes: s.pauseMinutes, notifyAfterFails: s.notifyAfterFails },
    questions: questions.map((q) => ({ id: q.id, text: q.text, options: q.options as string[], correctIndex: q.correctIndex, isActive: q.isActive, answered: q._count.answers > 0 })),
  };
}

export async function saveTestSettings(
  competencyId: number,
  input: { isActive?: boolean; questionsPerAttempt?: number | null; passPercent?: number; excellentPercent?: number },
  actorEmploymentId: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const competency = await prisma.competency.findUnique({ where: { id: competencyId }, include: { test: true } });
  if (!competency) return { ok: false, error: "Компетенцію не знайдено" };
  const current = competency.test ?? DEFAULT_TEST_SETTINGS;

  const passPercent = input.passPercent ?? current.passPercent;
  const excellentPercent = input.excellentPercent ?? current.excellentPercent;
  const perAttempt = input.questionsPerAttempt === undefined ? current.questionsPerAttempt : input.questionsPerAttempt;
  if (!Number.isInteger(passPercent) || passPercent < 1 || passPercent > 100) return { ok: false, error: "Поріг «зараховано» має бути від 1 до 100%" };
  if (!Number.isInteger(excellentPercent) || excellentPercent < passPercent || excellentPercent > 100) return { ok: false, error: "Поріг «відмінно» не може бути нижчим за поріг «зараховано»" };
  if (perAttempt !== null && (!Number.isInteger(perAttempt) || perAttempt < 1 || perAttempt > 200)) return { ok: false, error: "Кількість питань у спробі має бути від 1 (або порожньо — усі питання)" };

  const data = { isActive: input.isActive ?? current.isActive, questionsPerAttempt: perAttempt, passPercent, excellentPercent };
  await prisma.competencyTest.upsert({ where: { competencyId }, create: { competencyId, ...data }, update: data });
  await logAudit({ actorId: actorEmploymentId, action: "test.settingsChanged", entityType: "Competency", entityId: competencyId, diff: data });
  return { ok: true };
}

export async function createQuestion(competencyId: number, input: Partial<QuestionInput>, actorEmploymentId: number | null): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const check = validateQuestion(input);
  if (!check.ok) return check;
  const competency = await prisma.competency.findUnique({ where: { id: competencyId } });
  if (!competency) return { ok: false, error: "Компетенцію не знайдено" };

  const q = await prisma.testQuestion.create({ data: { competencyId, ...check.value, createdById: actorEmploymentId } });
  // Перше питання — тест одразу стає доступним (рядок налаштувань зі значеннями за замовчуванням).
  await prisma.competencyTest.upsert({ where: { competencyId }, create: { competencyId }, update: {} });
  await logAudit({ actorId: actorEmploymentId, action: "test.questionCreated", entityType: "TestQuestion", entityId: q.id });
  return { ok: true, id: q.id };
}

/** Редагування питання. Якщо на нього вже відповідали — створюється нове питання, старе вимикається (історія результатів не ламається). */
export async function updateQuestion(
  id: number,
  patch: Partial<QuestionInput> & { isActive?: boolean },
  actorEmploymentId: number | null,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const q = await prisma.testQuestion.findUnique({ where: { id }, include: { _count: { select: { answers: true } } } });
  if (!q) return { ok: false, error: "Питання не знайдено" };

  const contentChanged = patch.text !== undefined || patch.options !== undefined || patch.correctIndex !== undefined;
  if (contentChanged) {
    const check = validateQuestion({ text: patch.text ?? q.text, options: patch.options ?? (q.options as string[]), correctIndex: patch.correctIndex ?? q.correctIndex });
    if (!check.ok) return check;
    if (q._count.answers > 0) {
      const created = await prisma.$transaction(async (tx) => {
        await tx.testQuestion.update({ where: { id }, data: { isActive: false } });
        return tx.testQuestion.create({ data: { competencyId: q.competencyId, ...check.value, isActive: patch.isActive ?? q.isActive, replacesId: id, createdById: actorEmploymentId } });
      });
      await logAudit({ actorId: actorEmploymentId, action: "test.questionRevised", entityType: "TestQuestion", entityId: created.id, diff: { replaces: id } });
      return { ok: true, id: created.id };
    }
    await prisma.testQuestion.update({ where: { id }, data: { ...check.value, ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}) } });
  } else if (patch.isActive !== undefined) {
    await prisma.testQuestion.update({ where: { id }, data: { isActive: patch.isActive } });
  }
  await logAudit({ actorId: actorEmploymentId, action: "test.questionUpdated", entityType: "TestQuestion", entityId: id });
  return { ok: true, id };
}

/** Видаляє питання, на яке ще не відповідали; інакше лише вимикає. */
export async function deleteQuestion(id: number, actorEmploymentId: number | null): Promise<{ ok: true; softDeleted: boolean } | { ok: false; error: string }> {
  const q = await prisma.testQuestion.findUnique({ where: { id }, include: { _count: { select: { answers: true } } } });
  if (!q) return { ok: false, error: "Питання не знайдено" };
  if (q._count.answers > 0) {
    await prisma.testQuestion.update({ where: { id }, data: { isActive: false } });
    await logAudit({ actorId: actorEmploymentId, action: "test.questionDeactivated", entityType: "TestQuestion", entityId: id });
    return { ok: true, softDeleted: true };
  }
  await prisma.testQuestion.delete({ where: { id } });
  await logAudit({ actorId: actorEmploymentId, action: "test.questionDeleted", entityType: "TestQuestion", entityId: id });
  return { ok: true, softDeleted: false };
}

/* ───────────── Проходження (бот) ───────────── */

type AttemptQuestions = { questionId: number; order: number[] }[];

export type TestAvailability = { ready: boolean; competencyName: string; error?: string };

/** Чи має компетенція готовий до проходження тест (є активне питання й тест не вимкнено). */
export async function getTestAvailability(competencyId: number): Promise<TestAvailability | null> {
  const competency = await prisma.competency.findUnique({ where: { id: competencyId }, include: { test: true, _count: { select: { testQuestions: { where: { isActive: true } } } } } });
  if (!competency) return null;
  const active = competency.test ? competency.test.isActive : false;
  return { ready: active && competency._count.testQuestions > 0, competencyName: competency.name };
}

export async function startAttempt(personId: number, competencyId: number): Promise<{ ok: true; attemptId: number; resumed: boolean } | { ok: false; error: string }> {
  const employment = await findActiveEmployment(personId);
  if (!employment) return { ok: false, error: "Не знайдено вашого працевлаштування" };
  const inProfile = await prisma.positionCompetency.findFirst({ where: { positionProfileId: employment.staffUnit.positionProfileId, competencyId } });
  if (!inProfile) return { ok: false, error: "Цієї компетенції немає у вашому профілі" };

  const competency = await prisma.competency.findUnique({ where: { id: competencyId }, include: { test: true } });
  if (!competency?.test || !competency.test.isActive) return { ok: false, error: "Тест ще не підготовлено — зверніться до адміністратора" };
  const settings = competency.test;

  const now = new Date();
  const unfinished = await prisma.testAttempt.findFirst({ where: { personId, competencyId, finishedAt: null, abandoned: false }, orderBy: { id: "desc" } });
  if (unfinished) {
    if (now.getTime() - unfinished.startedAt.getTime() < ATTEMPT_EXPIRES_MS) return { ok: true, attemptId: unfinished.id, resumed: true };
    await prisma.testAttempt.update({ where: { id: unfinished.id }, data: { abandoned: true } });
  }

  const last = await prisma.testAttempt.findFirst({ where: { personId, competencyId, finishedAt: { not: null } }, orderBy: { finishedAt: "desc" } });
  if (last?.finishedAt) {
    const nextAt = last.finishedAt.getTime() + settings.pauseMinutes * 60_000;
    if (nextAt > now.getTime()) return { ok: false, error: `Наступну спробу можна почати через ${Math.ceil((nextAt - now.getTime()) / 60_000)} хв` };
  }

  const pool = await prisma.testQuestion.findMany({ where: { competencyId, isActive: true } });
  if (!pool.length) return { ok: false, error: "Тест ще не підготовлено — зверніться до адміністратора" };
  const count = Math.min(settings.questionsPerAttempt ?? pool.length, pool.length);
  const chosen = shuffle(pool).slice(0, count);
  const questions: AttemptQuestions = chosen.map((q) => ({ questionId: q.id, order: shuffle(Array.from({ length: (q.options as string[]).length }, (_, i) => i)) }));

  const attempt = await prisma.testAttempt.create({ data: { personId, competencyId, questions, totalQuestions: questions.length } });
  return { ok: true, attemptId: attempt.id, resumed: false };
}

export type CurrentQuestion = { position: number; total: number; text: string; options: string[] };

/** Наступне питання спроби (або null, якщо спробу завершено чи вона не ця людини). */
export async function getCurrentQuestion(attemptId: number, personId: number): Promise<CurrentQuestion | null> {
  const attempt = await prisma.testAttempt.findUnique({ where: { id: attemptId }, include: { answers: true } });
  if (!attempt || attempt.personId !== personId || attempt.finishedAt) return null;
  const position = attempt.answers.length;
  const slot = (attempt.questions as AttemptQuestions)[position];
  if (!slot) return null;
  const question = await prisma.testQuestion.findUnique({ where: { id: slot.questionId } });
  if (!question) return null;
  const options = question.options as string[];
  return { position, total: attempt.totalQuestions, text: question.text, options: slot.order.map((i) => options[i]) };
}

export type AttemptResult = { correct: number; total: number; percent: number; score: number; passed: boolean; failStreak: number; nextAllowedAt: Date };

export async function answerQuestion(
  attemptId: number,
  personId: number,
  position: number,
  optionPosition: number,
): Promise<{ ok: true; finished: false } | { ok: true; finished: true; result: AttemptResult; competencyName: string } | { ok: false; error: string }> {
  const attempt = await prisma.testAttempt.findUnique({ where: { id: attemptId }, include: { answers: true } });
  if (!attempt || attempt.personId !== personId) return { ok: false, error: "Спробу не знайдено" };
  if (attempt.finishedAt) return { ok: false, error: "Тест уже завершено" };
  if (position !== attempt.answers.length) return { ok: false, error: "Це питання вже пройдено" };

  const slot = (attempt.questions as AttemptQuestions)[position];
  if (!slot || !Number.isInteger(optionPosition) || optionPosition < 0 || optionPosition >= slot.order.length) return { ok: false, error: "Невірна відповідь" };
  const question = await prisma.testQuestion.findUniqueOrThrow({ where: { id: slot.questionId } });
  const chosenIndex = slot.order[optionPosition];

  await prisma.testAnswer.create({ data: { attemptId, questionId: question.id, position, chosenIndex, isCorrect: chosenIndex === question.correctIndex } });
  if (position + 1 < attempt.totalQuestions) return { ok: true, finished: false };
  const { result, competencyName } = await finishAttempt(attemptId);
  return { ok: true, finished: true, result, competencyName };
}

async function finishAttempt(attemptId: number): Promise<{ result: AttemptResult; competencyName: string }> {
  const attempt = await prisma.testAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { answers: true, competency: { include: { test: true } } } });
  const settings = attempt.competency.test ?? DEFAULT_TEST_SETTINGS;
  const correct = attempt.answers.filter((a) => a.isCorrect).length;
  const total = attempt.totalQuestions;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const passed = percent >= settings.passPercent;
  const score = percent >= settings.excellentPercent ? 2 : passed ? 1 : 0;
  const finishedAt = new Date();

  await prisma.testAttempt.update({ where: { id: attemptId }, data: { finishedAt, correctCount: correct, percent, score, passed } });
  const employment = await findActiveEmployment(attempt.personId);
  await logAudit({ actorId: employment?.id ?? null, action: "test.finished", entityType: "Competency", entityId: attempt.competencyId, diff: { attemptId, percent, score, passed } });

  let failStreak = 0;
  if (passed) {
    await recordPassedCompetency(attempt.personId, attempt.competencyId, score);
  } else {
    failStreak = await countFailStreak(attempt.personId, attempt.competencyId);
    if (employment && failStreak > 0 && failStreak % settings.notifyAfterFails === 0) {
      await notifyAdminAboutFails(employment.id, attempt.competency.name, failStreak, percent);
    }
  }
  return {
    result: { correct, total, percent, score, passed, failStreak, nextAllowedAt: new Date(finishedAt.getTime() + settings.pauseMinutes * 60_000) },
    competencyName: attempt.competency.name,
  };
}

/** Невдалі спроби поспіль із моменту останнього складання. */
async function countFailStreak(personId: number, competencyId: number): Promise<number> {
  const finished = await prisma.testAttempt.findMany({ where: { personId, competencyId, finishedAt: { not: null }, abandoned: false }, orderBy: { finishedAt: "desc" }, select: { passed: true } });
  let streak = 0;
  for (const a of finished) {
    if (a.passed) break;
    streak += 1;
  }
  return streak;
}

async function notifyAdminAboutFails(employmentId: number, competencyName: string, count: number, percent: number): Promise<void> {
  try {
    const employment = await prisma.employment.findUniqueOrThrow({ where: { id: employmentId }, include: { person: true, staffUnit: { include: { orgNode: true } } } });
    const adminId = await resolveAssignee(Role.STORE_ADMIN, employment.staffUnit.orgNode.path, employmentId);
    const admin = adminId ? await prisma.employment.findUnique({ where: { id: adminId } }) : null;
    if (!admin) return;
    await sendNotification(admin.personId, "test.failedRepeatedly", { fullName: employment.person.fullName, name: competencyName, count: String(count), percent: String(percent) });
  } catch (e) {
    console.error("Сповіщення про невдалі спроби тесту не надіслано:", e);
  }
}

/**
 * Склав тест: якщо в онбордингу чекає пункт «Тест …» цієї компетенції — він закривається
 * (запис компетенції створює completeTask); інакше запис створюємо самі, але лише якщо
 * бал вищий за вже чинний (повторне проходження піднімає оцінку, а не знижує).
 */
async function recordPassedCompetency(personId: number, competencyId: number, score: number): Promise<void> {
  const employment = await findActiveEmployment(personId);
  if (!employment) return;

  const task = await prisma.task.findFirst({
    where: { assigneeId: employment.id, status: TaskStatus.PENDING, itemTemplate: { actionType: ActionType.TEST, competencyId }, instance: { state: "RUNNING" } },
  });
  if (task) {
    const done = await completeTask(task.id, employment.id, { score });
    if (done.ok) return;
  }

  const now = new Date();
  const best = await prisma.competencyRecord.findFirst({
    where: { personId, competencyId, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
    orderBy: [{ score: "desc" }, { passedAt: "desc" }],
  });
  if (best && (best.score ?? 0) >= score) return;

  const competency = await prisma.competency.findUniqueOrThrow({ where: { id: competencyId } });
  const validUntil = competency.validMonths ? new Date(new Date(now).setMonth(now.getMonth() + competency.validMonths)) : null;
  await prisma.competencyRecord.create({ data: { personId, competencyId, passedAt: now, score, validUntil, source: CompetencySource.TEST } });
  await checkProfileClosedBadge(personId);
  await checkBeyondProfileBadge(personId);
}

/** Журнал спроб працівника (вкладка «Тести» в картці). */
export async function getPersonAttempts(personId: number) {
  const attempts = await prisma.testAttempt.findMany({
    where: { personId, finishedAt: { not: null } },
    orderBy: { finishedAt: "desc" },
    take: 200,
    include: { competency: true },
  });
  return attempts.map((a) => ({
    id: a.id,
    competencyName: a.competency.name,
    finishedAt: a.finishedAt,
    correct: a.correctCount ?? 0,
    total: a.totalQuestions,
    percent: a.percent ?? 0,
    score: a.score ?? 0,
    passed: a.passed ?? false,
  }));
}
