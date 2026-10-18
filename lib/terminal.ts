import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { can, getEffectiveGrants } from "./permissions";
import { getSessionPerson } from "./auth";
import { resolveAssignee } from "./onboarding";
import { sendNotification } from "./notificationTemplates";
import { Capability, EmploymentStatus, Role, ScanAction, ShiftCloseKind } from "../generated/prisma/client";

/**
 * Термінал обліку робочого часу (2026-10-18). Комп'ютер реєструється
 * сисадміном/COO/директором кластера: токен у httpOnly-cookie цього
 * комп'ютера, у базі — лише хеш. Магазин береться з терміналу, а не з
 * вибору касира. Окремо від сесії людини: сесія каже ХТО працює за
 * комп'ютером, токен — НА ЯКОМУ комп'ютері й для якого магазину.
 */
export const TERMINAL_COOKIE_NAME = "hr_terminal";
const TERMINAL_COOKIE_TTL_MS = 5 * 365 * 24 * 60 * 60 * 1000;

/** Повторне сканування одного й того ж працівника швидше за це — дубль (касир двічі клацнув). */
const DUPLICATE_WINDOW_MS = 10_000;
/** Завершення швидше за це після прибуття потребує окремого підтвердження. */
const SHORT_SHIFT_MS = 30 * 60 * 1000;
/** Термінал, що не озивався стільки, вважається "мовчить" (рішення 2026-10-18: 3 дні). */
export const SILENCE_DAYS = 3;
/** Відмітка з офлайн-черги: час з годинника комп'ютера може трохи випереджати сервер... */
const QUEUED_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
/** ...а надто стара відмітка — майже напевно помилка; такі виправляє адмін у табелі. */
const QUEUED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Хто може відмітитись (рішення 2026-10-18): працює або відпрацьовує; заморожені, звільнені й ще неоформлені — ні. */
const SCANNABLE_STATUSES: EmploymentStatus[] = [
  EmploymentStatus.TRAINEE,
  EmploymentStatus.READY_FOR_ATTESTATION,
  EmploymentStatus.ACTIVE,
  EmploymentStatus.TERMINATION_STARTED,
  EmploymentStatus.TRANSFER_PENDING,
];

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function registerTerminal(orgNodeId: number, name: string, registeredById: number): Promise<number> {
  const token = randomBytes(32).toString("base64url");
  const terminal = await prisma.terminal.create({
    data: { orgNodeId, name, tokenHash: hashToken(token), registeredById },
  });

  const cookieStore = await cookies();
  cookieStore.set(TERMINAL_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(Date.now() + TERMINAL_COOKIE_TTL_MS),
  });

  await logAudit({ actorId: registeredById, action: "terminal.registered", entityType: "Terminal", entityId: terminal.id, diff: { orgNodeId, name } });
  return terminal.id;
}

/** Термінал цього комп'ютера (за cookie) або null; заодно відмічає "востаннє на зв'язку". */
export async function getCurrentTerminal() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TERMINAL_COOKIE_NAME)?.value;
  if (!token) return null;

  const terminal = await prisma.terminal.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { orgNode: true },
  });
  if (!terminal || terminal.revokedAt) return null;

  await prisma.terminal.update({ where: { id: terminal.id }, data: { lastSeenAt: new Date(), silenceAlertedAt: null } });
  return terminal;
}

export type TerminalContext = NonNullable<Awaited<ReturnType<typeof getCurrentTerminal>>>;

/**
 * Єдина перевірка для всіх запитів терміналу: залогований + цей комп'ютер
 * зареєстрований + людина має OPERATE_TERMINAL саме на магазин терміналу
 * (старший касир SH01 не керує терміналом SH03).
 */
export async function requireTerminalOperator(): Promise<
  | { ok: true; terminal: TerminalContext; operatorEmploymentId: number; operatorName: string }
  | { ok: false; status: number; code: string; error: string }
> {
  const person = await getSessionPerson();
  if (!person) return { ok: false, status: 401, code: "NO_SESSION", error: "Не залогований" };

  const terminal = await getCurrentTerminal();
  if (!terminal) return { ok: false, status: 409, code: "NO_TERMINAL", error: "Цей комп'ютер не зареєстровано як термінал" };

  const allowed = await can(person.id, Capability.OPERATE_TERMINAL, { orgNodePath: terminal.orgNode.path });
  if (!allowed) return { ok: false, status: 403, code: "FORBIDDEN", error: "Немає права працювати з терміналом цього магазину" };

  const operator = await prisma.employment.findFirst({
    where: { personId: person.id, status: { not: EmploymentStatus.TERMINATED } },
    orderBy: { id: "desc" },
  });
  if (!operator) return { ok: false, status: 400, code: "NO_EMPLOYMENT", error: "Не знайдено активне працевлаштування" };

  return { ok: true, terminal, operatorEmploymentId: operator.id, operatorName: person.fullName };
}

export type LookupResult =
  | {
      ok: true;
      employmentId: number;
      personId: number;
      fullName: string;
      positionTitle: string;
      action: ScanAction;
      openShiftSince: string | null;
      /** Завершення раніше ніж за 30 хв після прибуття — потрібне окреме підтвердження. */
      shortShift: boolean;
    }
  | { ok: false; error: string };

/** Знаходить працівника за кодом і каже, що буде: прибуття (нема відкритої зміни) чи завершення. */
export async function lookupByCode(code: string, now: Date = new Date()): Promise<LookupResult> {
  const clean = code.trim();
  if (!/^\d{4,20}$/.test(clean)) return { ok: false, error: "Невірний формат коду" };

  const person = await prisma.person.findUnique({ where: { badgeCode: clean } });
  if (!person) return { ok: false, error: "Код не знайдено — можливо, бейдж перевидано" };

  const employment = await prisma.employment.findFirst({
    where: { personId: person.id, status: { not: EmploymentStatus.TERMINATED } },
    include: { staffUnit: { include: { positionProfile: true } } },
    orderBy: { id: "desc" },
  });
  if (!employment) return { ok: false, error: `${person.fullName}: працівника звільнено` };
  if (!SCANNABLE_STATUSES.includes(employment.status)) {
    return { ok: false, error: `${person.fullName}: реєстрація недоступна для статусу «${employment.status}»` };
  }

  const openShift = await prisma.workShift.findFirst({ where: { employmentId: employment.id, endedAt: null }, orderBy: { startedAt: "desc" } });
  return {
    ok: true,
    employmentId: employment.id,
    personId: person.id,
    fullName: person.fullName,
    positionTitle: employment.staffUnit.positionProfile.title,
    action: openShift ? ScanAction.DEPARTURE : ScanAction.ARRIVAL,
    openShiftSince: openShift ? openShift.startedAt.toISOString() : null,
    shortShift: openShift ? now.getTime() - openShift.startedAt.getTime() < SHORT_SHIFT_MS : false,
  };
}

export type ConfirmResult =
  | { ok: true; duplicate: boolean; action: ScanAction; fullName: string }
  | { ok: false; error: string; code?: "STATE_CHANGED" | "CONFIRM_SHORT" };

/**
 * Підтвердження касиром. Три шари проти подвійного запису: (1) clientEventId
 * унікальний — повторна відправка тієї самої події повертає успіх без
 * другого запису; (2) інша подія цієї ж людини протягом 10 с — дубль;
 * (3) дія перераховується на сервері й має збігатися з тим, що бачив
 * касир (хтось міг уже відмітити людину іншим терміналом).
 */
export async function confirmScan(input: {
  terminal: TerminalContext;
  operatorEmploymentId: number;
  code: string;
  clientEventId: string;
  expectedAction?: ScanAction;
  confirmShort: boolean;
  /** Є лише для відмітки з офлайн-черги: час, коли бейдж справді відсканували. */
  scannedAt?: Date;
}): Promise<ConfirmResult> {
  const now = new Date();
  const queued = input.scannedAt !== undefined;
  const scannedAt = input.scannedAt ?? now;
  if (queued) {
    if (Number.isNaN(scannedAt.getTime())) return { ok: false, error: "Невірний час відмітки" };
    if (scannedAt.getTime() > now.getTime() + QUEUED_FUTURE_TOLERANCE_MS) return { ok: false, error: "Час відмітки в майбутньому — перевірте годинник комп'ютера" };
    if (scannedAt.getTime() < now.getTime() - QUEUED_MAX_AGE_MS) return { ok: false, error: "Відмітка надто стара (понад 7 днів) — внесіть зміну вручну в табелі" };
  }

  const existing = await prisma.scanEvent.findUnique({ where: { clientEventId: input.clientEventId }, include: { employment: { include: { person: true } } } });
  if (existing) return { ok: true, duplicate: true, action: existing.action, fullName: existing.employment.person.fullName };

  const lookup = await lookupByCode(input.code, scannedAt);
  if (!lookup.ok) return { ok: false, error: lookup.error };

  const recent = await prisma.scanEvent.findFirst({
    where: queued
      ? { employmentId: lookup.employmentId, scannedAt: { gte: new Date(scannedAt.getTime() - DUPLICATE_WINDOW_MS), lte: new Date(scannedAt.getTime() + DUPLICATE_WINDOW_MS) } }
      : { employmentId: lookup.employmentId, receivedAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) } },
  });
  if (recent) return { ok: true, duplicate: true, action: recent.action, fullName: lookup.fullName };

  if (queued) {
    // Касир не бачив, що це буде; дію вирішує сервер за станом на момент відмітки.
    // Відмітка не може перетнутися з уже записаними змінами працівника.
    if (lookup.action === ScanAction.ARRIVAL) {
      const later = await prisma.workShift.findFirst({
        where: { employmentId: lookup.employmentId, OR: [{ startedAt: { gte: scannedAt } }, { endedAt: { gt: scannedAt } }] },
      });
      if (later) return { ok: false, error: `${lookup.fullName}: час відмітки перетинається з уже записаною зміною — виправте в табелі` };
    } else {
      const open = await prisma.workShift.findFirst({ where: { employmentId: lookup.employmentId, endedAt: null }, orderBy: { startedAt: "desc" } });
      if (open && open.startedAt.getTime() >= scannedAt.getTime()) {
        return { ok: false, error: `${lookup.fullName}: час завершення раніше за початок відкритої зміни — виправте в табелі` };
      }
    }
  } else {
    if (lookup.action !== input.expectedAction) {
      return { ok: false, code: "STATE_CHANGED", error: "Стан працівника змінився — скануйте ще раз" };
    }
    if (lookup.action === ScanAction.DEPARTURE && lookup.shortShift && !input.confirmShort) {
      return { ok: false, code: "CONFIRM_SHORT", error: "Зміна триває менше 30 хвилин" };
    }
  }

  await prisma.$transaction(async (tx) => {
    let shiftId: number;
    if (lookup.action === ScanAction.ARRIVAL) {
      const shift = await tx.workShift.create({
        data: { employmentId: lookup.employmentId, orgNodeId: input.terminal.orgNodeId, startedAt: scannedAt, startTerminalId: input.terminal.id },
      });
      shiftId = shift.id;
    } else {
      const open = await tx.workShift.findFirstOrThrow({ where: { employmentId: lookup.employmentId, endedAt: null }, orderBy: { startedAt: "desc" } });
      await tx.workShift.update({
        where: { id: open.id },
        data: { endedAt: scannedAt, endTerminalId: input.terminal.id, closeKind: ShiftCloseKind.TERMINAL },
      });
      shiftId = open.id;
    }
    await tx.scanEvent.create({
      data: {
        clientEventId: input.clientEventId,
        employmentId: lookup.employmentId,
        terminalId: input.terminal.id,
        operatorId: input.operatorEmploymentId,
        action: lookup.action,
        scannedAt,
        shiftId,
      },
    });
  });

  return { ok: true, duplicate: false, action: lookup.action, fullName: lookup.fullName };
}

/** Області, де людина має MANAGE_TERMINALS — той самий принцип, що getVacancyScopePaths. */
export async function getTerminalScopePaths(personId: number): Promise<string[]> {
  const grants = await getEffectiveGrants(personId);
  const paths = new Set<string>();
  for (const g of grants) if (g.capability === Capability.MANAGE_TERMINALS && g.scopePath) paths.add(g.scopePath);
  return [...paths];
}

/** Хто зараз на зміні в магазині терміналу — для екрана (касир бачить результат своїх дій). */
export async function listOnShift(orgNodeId: number) {
  const shifts = await prisma.workShift.findMany({
    where: { orgNodeId, endedAt: null },
    include: { employment: { include: { person: true, staffUnit: { include: { positionProfile: true } } } } },
    orderBy: { startedAt: "asc" },
  });
  return shifts.map((s) => ({
    employmentId: s.employmentId,
    fullName: s.employment.person.fullName,
    positionTitle: s.employment.staffUnit.positionProfile.title,
    since: s.startedAt.toISOString(),
  }));
}

export type QueuedScanInput = { clientEventId: string; code: string; scannedAt: string };
export type QueuedScanResult = { clientEventId: string; status: "ok" | "duplicate" | "error"; fullName?: string; action?: ScanAction; error?: string };

/**
 * Відмітки, накопичені офлайн (етап 4). Обробляються за часом відмітки, не за
 * порядком надходження: прибуття має бути раніше за завершення. Кожна подія
 * ідемпотентна за clientEventId, тож повторна відправка безпечна.
 */
export async function syncQueuedScans(
  terminal: TerminalContext,
  operatorEmploymentId: number,
  events: QueuedScanInput[],
): Promise<QueuedScanResult[]> {
  const sorted = [...events].sort((a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime());
  const results: QueuedScanResult[] = [];
  for (const e of sorted) {
    if (!e.clientEventId || e.clientEventId.length > 64 || typeof e.code !== "string") {
      results.push({ clientEventId: String(e.clientEventId ?? ""), status: "error", error: "Невірні дані відмітки" });
      continue;
    }
    const r = await confirmScan({
      terminal,
      operatorEmploymentId,
      code: e.code,
      clientEventId: e.clientEventId,
      confirmShort: true,
      scannedAt: new Date(e.scannedAt),
    });
    if (r.ok) results.push({ clientEventId: e.clientEventId, status: r.duplicate ? "duplicate" : "ok", fullName: r.fullName, action: r.action });
    else results.push({ clientEventId: e.clientEventId, status: "error", error: r.error });
  }
  return results;
}

/** Сигнал "термінал живий" (раз на хвилину, не потребує сесії касира): оновлює lastSeenAt через getCurrentTerminal. */
export async function recordHeartbeat(terminalId: number, pendingCount: number): Promise<void> {
  await prisma.terminal.update({ where: { id: terminalId }, data: { lastPendingCount: Math.max(0, Math.min(10_000, Math.floor(pendingCount) || 0)) } });
}

/**
 * Щогодинна перевірка (bot/index.ts): термінал, що не озивався 3 дні, —
 * один алерт сисадміну й COO; повторне нагадування, якщо досі мовчить ще
 * 3 дні. Сам факт "озвався" скидає позначку (getCurrentTerminal).
 */
export async function checkSilentTerminals(now: Date = new Date()): Promise<{ alerted: number }> {
  const limit = new Date(now.getTime() - SILENCE_DAYS * 24 * 60 * 60 * 1000);
  const terminals = await prisma.terminal.findMany({ where: { revokedAt: null }, include: { orgNode: true } });

  let alerted = 0;
  for (const t of terminals) {
    const lastContact = t.lastSeenAt ?? t.createdAt;
    if (lastContact >= limit) continue;
    if (t.silenceAlertedAt && t.silenceAlertedAt >= limit) continue;

    const recipients = new Set<number>();
    for (const role of [Role.SYSADMIN, Role.COO]) {
      const employmentId = await resolveAssignee(role, t.orgNode.path);
      if (!employmentId) continue;
      const e = await prisma.employment.findUnique({ where: { id: employmentId } });
      if (e) recipients.add(e.personId);
    }
    for (const personId of recipients) {
      await sendNotification(personId, "terminal.silent", {
        terminalName: t.name,
        storeName: t.orgNode.name,
        since: lastContact.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
        days: String(SILENCE_DAYS),
      });
    }
    await prisma.terminal.update({ where: { id: t.id }, data: { silenceAlertedAt: now } });
    await logAudit({ actorId: null, action: "terminal.silent", entityType: "Terminal", entityId: t.id, diff: { lastContact: lastContact.toISOString() } });
    alerted += 1;
  }
  return { alerted };
}
