import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { can, getEffectiveGrants } from "./permissions";
import { getSessionPerson } from "./auth";
import { Capability, EmploymentStatus, ScanAction, ShiftCloseKind } from "../generated/prisma/client";

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

  await prisma.terminal.update({ where: { id: terminal.id }, data: { lastSeenAt: new Date() } });
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
  expectedAction: ScanAction;
  confirmShort: boolean;
  scannedAt?: Date;
}): Promise<ConfirmResult> {
  const now = new Date();
  const scannedAt = input.scannedAt ?? now;

  const existing = await prisma.scanEvent.findUnique({ where: { clientEventId: input.clientEventId }, include: { employment: { include: { person: true } } } });
  if (existing) return { ok: true, duplicate: true, action: existing.action, fullName: existing.employment.person.fullName };

  const lookup = await lookupByCode(input.code, scannedAt);
  if (!lookup.ok) return { ok: false, error: lookup.error };

  const recent = await prisma.scanEvent.findFirst({
    where: { employmentId: lookup.employmentId, receivedAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) } },
  });
  if (recent) return { ok: true, duplicate: true, action: recent.action, fullName: lookup.fullName };

  if (lookup.action !== input.expectedAction) {
    return { ok: false, code: "STATE_CHANGED", error: "Стан працівника змінився — скануйте ще раз" };
  }
  if (lookup.action === ScanAction.DEPARTURE && lookup.shortShift && !input.confirmShort) {
    return { ok: false, code: "CONFIRM_SHORT", error: "Зміна триває менше 30 хвилин" };
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
