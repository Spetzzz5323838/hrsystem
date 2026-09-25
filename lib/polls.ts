import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { sendNotification } from "./notificationTemplates";
import { hasAccess } from "./access";
import { EmploymentStatus, PollStatus } from "../generated/prisma/client";

/**
 * Опитування (з розмови 2026-09-24, поза докс) — та сама модель області,
 * що Announcement. Голосувати можна і в боті (кнопками — головний канал
 * для лінійного персоналу, архітектурне рішення №1), і на вебі (правки
 * 2026-09-25) — той самий castVote() з тим самим захистом.
 */
export async function createPoll(
  orgNodeId: number,
  question: string,
  options: string[],
  isAnonymous: boolean,
  closesAt: Date | null,
  authorId: number | null,
): Promise<{ ok: true; id: number; recipientCount: number } | { ok: false; error: string }> {
  const orgNode = await prisma.orgNode.findUnique({ where: { id: orgNodeId } });
  if (!orgNode) return { ok: false, error: "Вузол не знайдено" };
  if (!question.trim()) return { ok: false, error: "Потрібне питання" };
  const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
  if (cleanOptions.length < 2) return { ok: false, error: "Потрібно щонайменше два варіанти відповіді" };

  const poll = await prisma.poll.create({
    data: {
      orgNodeId,
      question: question.trim(),
      isAnonymous,
      closesAt,
      authorId,
      options: { create: cleanOptions.map((text, i) => ({ text, order: i })) },
    },
    include: { options: { orderBy: { order: "asc" } } },
  });

  await logAudit({ actorId: authorId, action: "poll.created", entityType: "Poll", entityId: poll.id, diff: { orgNodeId, question, isAnonymous } });

  const recipients = await prisma.employment.findMany({
    where: {
      status: { not: EmploymentStatus.TERMINATED },
      staffUnit: { orgNode: { OR: [{ id: orgNodeId }, { path: { startsWith: `${orgNode.path}.` } }] } },
    },
    select: { personId: true },
    distinct: ["personId"],
  });

  const replyMarkup = {
    inline_keyboard: poll.options.map((o) => [{ text: o.text, callback_data: `poll_vote:${poll.id}:${o.id}` }]),
  };

  for (const r of recipients) {
    await sendNotification(r.personId, "poll.opened", { question: question.trim() }, replyMarkup);
  }

  return { ok: true, id: poll.id, recipientCount: recipients.length };
}

export async function listPollsForManagement(scopePaths: string[]) {
  const polls = await prisma.poll.findMany({
    where: { orgNode: { OR: scopePaths.map((p) => ({ OR: [{ path: p }, { path: { startsWith: `${p}.` } }] })) } },
    include: {
      orgNode: true,
      author: { include: { person: true } },
      options: { orderBy: { order: "asc" }, include: { _count: { select: { votes: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return polls.map((p) => ({
    id: p.id,
    question: p.question,
    isAnonymous: p.isAnonymous,
    status: p.status,
    objectName: p.orgNode.name,
    authorName: p.author?.person.fullName ?? null,
    createdAt: p.createdAt,
    closesAt: p.closesAt,
    options: p.options.map((o) => ({ id: o.id, text: o.text, voteCount: o._count.votes })),
    totalVotes: p.options.reduce((sum, o) => sum + o._count.votes, 0),
  }));
}

/**
 * Опитування, що реально стосуються цієї людини (правки 2026-09-25) — для
 * перегляду й голосування на вебі (`/`, `/me`), той самий принцип, що
 * lib/announcements.ts::listAnnouncementsForPerson. Лише відкриті —
 * закриті бачать тільки керівники на /communications. Кількість голосів
 * показуємо тільки ПІСЛЯ того, як людина сама проголосувала (щоб не
 * підказувати результат наперед).
 */
export async function listPollsForPerson(personId: number) {
  const employments = await prisma.employment.findMany({
    where: { personId, status: { not: EmploymentStatus.TERMINATED } },
    include: { staffUnit: { include: { orgNode: true } } },
  });
  if (!employments.length) return [];

  const openPolls = await prisma.poll.findMany({
    where: { status: PollStatus.OPEN },
    include: { orgNode: true, options: { orderBy: { order: "asc" }, include: { _count: { select: { votes: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  const relevant = openPolls.filter((p) => employments.some((e) => hasAccess(p.orgNode.path, e.staffUnit.orgNode.path)));
  if (!relevant.length) return [];

  const myVotes = await prisma.pollVote.findMany({ where: { personId, pollId: { in: relevant.map((p) => p.id) } } });
  const myVoteByPoll = new Map(myVotes.map((v) => [v.pollId, v.optionId]));

  return relevant.map((p) => {
    const myOptionId = myVoteByPoll.get(p.id) ?? null;
    const hasVoted = myOptionId !== null;
    const totalVotes = p.options.reduce((sum, o) => sum + o._count.votes, 0);
    return {
      id: p.id,
      question: p.question,
      isAnonymous: p.isAnonymous,
      objectName: p.orgNode.name,
      closesAt: p.closesAt,
      hasVoted,
      myOptionId,
      totalVotes: hasVoted ? totalVotes : null,
      options: p.options.map((o) => ({ id: o.id, text: o.text, voteCount: hasVoted ? o._count.votes : null })),
    };
  });
}

export async function closePoll(pollId: number, actorId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const poll = await prisma.poll.findUnique({ where: { id: pollId } });
  if (!poll) return { ok: false, error: "Опитування не знайдено" };
  if (poll.status === PollStatus.CLOSED) return { ok: false, error: "Уже закрите" };

  await prisma.poll.update({ where: { id: pollId }, data: { status: PollStatus.CLOSED, closedAt: new Date() } });
  await logAudit({ actorId, action: "poll.closed", entityType: "Poll", entityId: pollId });
  return { ok: true };
}

/** Щогодинна перевірка (bot/index.ts) — закриває опитування з минулим дедлайном. */
export async function closeExpiredPolls(): Promise<void> {
  const expired = await prisma.poll.findMany({ where: { status: PollStatus.OPEN, closesAt: { lte: new Date() } } });
  for (const p of expired) {
    await prisma.poll.update({ where: { id: p.id }, data: { status: PollStatus.CLOSED, closedAt: new Date() } });
    await logAudit({ actorId: null, action: "poll.closed", entityType: "Poll", entityId: p.id, diff: { reason: "closesAt минув" } });
  }
}

/**
 * Голос у боті (callback employee_vote): перевіряє, що людина належить до
 * області опитування (реальний отримувач, не хтось сторонній) і що
 * опитування ще відкрите, потім записує голос. Унікальність (pollId,
 * personId) захищає від повторного голосу на рівні бази.
 */
export async function castVote(pollId: number, optionId: number, personId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: { orgNode: true } });
  if (!poll) return { ok: false, error: "Опитування не знайдено" };
  if (poll.status === PollStatus.CLOSED) return { ok: false, error: "Опитування вже закрите" };

  const option = await prisma.pollOption.findUnique({ where: { id: optionId } });
  if (!option || option.pollId !== pollId) return { ok: false, error: "Невірний варіант відповіді" };

  const employment = await prisma.employment.findFirst({
    where: {
      personId,
      status: { not: EmploymentStatus.TERMINATED },
      staffUnit: { orgNode: { OR: [{ id: poll.orgNodeId }, { path: { startsWith: `${poll.orgNode.path}.` } }] } },
    },
  });
  if (!employment) return { ok: false, error: "Це опитування не для вас" };

  const existing = await prisma.pollVote.findUnique({ where: { pollId_personId: { pollId, personId } } });
  if (existing) return { ok: false, error: "Ви вже проголосували" };

  await prisma.pollVote.create({ data: { pollId, optionId, personId } });
  return { ok: true };
}
