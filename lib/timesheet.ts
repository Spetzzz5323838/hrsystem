import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { hasAccess } from "./access";
import { companyRootPath, getEffectiveGrants } from "./permissions";
import { FREQUENT_CORRECTIONS_THRESHOLD, REASON_LABELS } from "./timesheetReasons";
import { resolveAssignee } from "./onboarding";
import { sendNotification } from "./notificationTemplates";
import { Capability, EmploymentStatus, Role, ShiftCloseKind, TimesheetCorrectionKind, TimesheetCorrectionReason } from "../generated/prisma/client";

/** Зміна, відкрита довше за це, вважається "забули відмітити завершення" (рішення 2026-10-18). */
const STALE_SHIFT_HOURS = 16;
/** Тривалість, яку ставимо автоматично закритій зміні. */
const AUTO_CLOSE_SHIFT_HOURS = 6;
/** Жодна зміна не може тривати довше за добу — захист від опечатки при ручній правці. */
const MAX_SHIFT_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

export async function getScopePaths(personId: number, capability: Capability): Promise<string[]> {
  const grants = await getEffectiveGrants(personId);
  const paths = new Set<string>();
  for (const g of grants) if (g.capability === capability && g.scopePath) paths.add(g.scopePath);
  return [...paths];
}

export type ShiftRow = {
  id: number;
  orgNodeId: number;
  storeName: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  closeKind: ShiftCloseKind | null;
  editedByName: string | null;
  editReason: string | null;
  /** Зміну скасовано (лишається в журналі, години не рахуються). */
  cancelled: boolean;
};

export type TimesheetEmployee = {
  employmentId: number;
  fullName: string;
  positionTitle: string;
  totalMinutes: number;
  shiftCount: number;
  autoClosedCount: number;
  editedCount: number;
  /** Скільки правок вручну за період (без автозакриття). */
  correctionsCount: number;
  /** Багато правок за місяць — привід придивитись (не відмічається чи проблема з терміналом). */
  frequentlyCorrected: boolean;
  hasOpenShift: boolean;
  shifts: ShiftRow[];
};

/**
 * Табель за період (етап 3). Зміна належить періоду за ЧАСОМ ПОЧАТКУ.
 * Відкрита зміна рахується до "зараз" і позначається — щоб бухгалтер
 * бачив, що цифра ще не остаточна. Магазин — той, де зміну розпочато.
 */
export async function getTimesheet(scopePaths: string[], from: Date, to: Date, orgNodeId: number | null): Promise<TimesheetEmployee[]> {
  const shifts = await prisma.workShift.findMany({
    where: { startedAt: { gte: from, lt: to }, ...(orgNodeId ? { orgNodeId } : {}) },
    include: {
      orgNode: true,
      editedBy: { include: { person: true } },
      employment: { include: { person: true, staffUnit: { include: { positionProfile: true } } } },
    },
    orderBy: { startedAt: "asc" },
  });

  const correctionCounts = await prisma.timesheetCorrection.groupBy({
    by: ["employmentId"],
    where: { kind: { not: TimesheetCorrectionKind.AUTO_CLOSE }, shift: { startedAt: { gte: from, lt: to } } },
    _count: { _all: true },
  });
  const correctionsByEmployment = new Map(correctionCounts.map((c) => [c.employmentId, c._count._all]));

  const now = Date.now();
  const byEmployment = new Map<number, TimesheetEmployee>();
  for (const s of shifts) {
    if (!scopePaths.some((p) => hasAccess(p, s.orgNode.path))) continue;

    const cancelled = s.cancelledAt !== null;
    const minutes = cancelled ? 0 : Math.max(0, Math.round(((s.endedAt?.getTime() ?? now) - s.startedAt.getTime()) / 60000));
    let row = byEmployment.get(s.employmentId);
    if (!row) {
      row = {
        employmentId: s.employmentId,
        fullName: s.employment.person.fullName,
        positionTitle: s.employment.staffUnit.positionProfile.title,
        totalMinutes: 0,
        shiftCount: 0,
        autoClosedCount: 0,
        editedCount: 0,
        correctionsCount: correctionsByEmployment.get(s.employmentId) ?? 0,
        frequentlyCorrected: (correctionsByEmployment.get(s.employmentId) ?? 0) >= FREQUENT_CORRECTIONS_THRESHOLD,
        hasOpenShift: false,
        shifts: [],
      };
      byEmployment.set(s.employmentId, row);
    }
    row.totalMinutes += minutes;
    if (!cancelled) row.shiftCount += 1;
    if (!cancelled && s.closeKind === ShiftCloseKind.AUTO) row.autoClosedCount += 1;
    if (!cancelled && s.editedAt) row.editedCount += 1;
    if (!cancelled && !s.endedAt) row.hasOpenShift = true;
    row.shifts.push({
      id: s.id,
      orgNodeId: s.orgNodeId,
      storeName: s.orgNode.name,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      minutes,
      closeKind: s.closeKind,
      editedByName: s.editedBy?.person.fullName ?? null,
      editReason: s.editReason,
      cancelled,
    });
  }
  return [...byEmployment.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, "uk"));
}

type EditResult = { ok: true; shiftId: number } | { ok: false; error: string };

async function validateInterval(employmentId: number, startedAt: Date, endedAt: Date | null, ignoreShiftId: number | null): Promise<string | null> {
  if (Number.isNaN(startedAt.getTime()) || (endedAt && Number.isNaN(endedAt.getTime()))) return "Невірна дата або час";
  if (startedAt.getTime() > Date.now() + 60_000) return "Початок зміни не може бути в майбутньому";
  if (endedAt) {
    if (endedAt.getTime() <= startedAt.getTime()) return "Завершення має бути пізніше за початок";
    if (endedAt.getTime() - startedAt.getTime() > MAX_SHIFT_HOURS * HOUR_MS) return `Зміна не може тривати довше ${MAX_SHIFT_HOURS} годин`;
    if (endedAt.getTime() > Date.now() + 60_000) return "Завершення не може бути в майбутньому";
  }

  const overlapping = await prisma.workShift.findFirst({
    where: {
      employmentId,
      cancelledAt: null,
      ...(ignoreShiftId ? { id: { not: ignoreShiftId } } : {}),
      startedAt: { lt: endedAt ?? new Date(8.64e15) },
      OR: [{ endedAt: null }, { endedAt: { gt: startedAt } }],
    },
  });
  return overlapping ? "Перетинається з іншою зміною цього працівника" : null;
}

const HOUR_MIN = 60;
const minutesBetween = (start: Date, end: Date | null) => (end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)) : 0);

/** Період табеля закривається після 15 числа наступного місяця (рішення власника 2026-10-28). */
export function isPeriodClosed(date: Date, now: Date = new Date()): boolean {
  const closeAt = new Date(date.getFullYear(), date.getMonth() + 1, 15, 23, 59, 59, 999);
  return now.getTime() > closeAt.getTime();
}

/** Правки закритого періоду — лише тим, хто має EDIT_SHIFTS на всю компанію (COO, власник). */
export async function canEditClosedPeriod(personId: number): Promise<boolean> {
  const root = await companyRootPath();
  if (!root) return false;
  const paths = await getScopePaths(personId, Capability.EDIT_SHIFTS);
  return paths.some((p) => hasAccess(p, root));
}

export type CorrectionInput = { reason: string; comment: string };

const SELECTABLE_REASONS = new Set<string>(["FORGOT_ARRIVAL", "FORGOT_DEPARTURE", "TERMINAL_FAILURE", "MARKED_BY_MISTAKE", "OFF_TERMINAL_WORK", "OTHER"]);

function validateCorrectionInput(input: CorrectionInput): { ok: true; reason: TimesheetCorrectionReason; comment: string } | { ok: false; error: string } {
  if (!SELECTABLE_REASONS.has(input.reason)) return { ok: false, error: "Оберіть причину правки зі списку" };
  const comment = (input.comment ?? "").trim();
  if (input.reason === "OTHER" && comment.length < 3) return { ok: false, error: "Для причини «Інше» опишіть, що сталося" };
  if (comment.length > 500) return { ok: false, error: "Коментар задовгий (максимум 500 символів)" };
  return { ok: true, reason: input.reason as TimesheetCorrectionReason, comment };
}

const reasonText = (reason: string, comment: string) => `${REASON_LABELS[reason] ?? reason}${comment ? `: ${comment}` : ""}`;
const fmtTime = (d: Date) => d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
const fmtDay = (d: Date) => d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });

/** Записує правку в журнал і повідомляє працівника (повідомлення не має ламати правку). */
async function recordCorrection(c: {
  kind: TimesheetCorrectionKind;
  shiftId: number;
  employmentId: number;
  orgNodeId: number;
  reason: TimesheetCorrectionReason;
  comment: string;
  before: { startedAt: Date; endedAt: Date | null } | null;
  after: { startedAt: Date; endedAt: Date | null } | null;
  actorEmploymentId: number | null;
  periodClosed: boolean;
}): Promise<void> {
  const beforeMinutes = c.before ? minutesBetween(c.before.startedAt, c.before.endedAt) : null;
  const afterMinutes = c.after ? minutesBetween(c.after.startedAt, c.after.endedAt) : 0;
  await prisma.timesheetCorrection.create({
    data: {
      kind: c.kind,
      shiftId: c.shiftId,
      employmentId: c.employmentId,
      orgNodeId: c.orgNodeId,
      reason: c.reason,
      comment: c.comment || null,
      beforeStartedAt: c.before?.startedAt ?? null,
      beforeEndedAt: c.before?.endedAt ?? null,
      afterStartedAt: c.after?.startedAt ?? null,
      afterEndedAt: c.after?.endedAt ?? null,
      beforeMinutes,
      afterMinutes,
      deltaMinutes: afterMinutes - (beforeMinutes ?? 0),
      actorId: c.actorEmploymentId,
      periodClosed: c.periodClosed,
    },
  });

  try {
    const employment = await prisma.employment.findUnique({ where: { id: c.employmentId } });
    if (!employment) return;
    const range = (x: { startedAt: Date; endedAt: Date | null }) => `${fmtTime(x.startedAt)}–${x.endedAt ? fmtTime(x.endedAt) : "…"}`;
    const day = c.after?.startedAt ?? c.before!.startedAt;
    let details: string;
    if (c.kind === TimesheetCorrectionKind.CREATE) details = `Додано зміну: ${range(c.after!)}`;
    else if (c.kind === TimesheetCorrectionKind.CANCEL) details = `Зміну ${range(c.before!)} скасовано`;
    else details = `Було: ${c.before ? range(c.before) : "—"}, стало: ${range(c.after!)}`;
    await sendNotification(employment.personId, "timesheet.corrected", { date: fmtDay(day), details, reason: reasonText(c.reason, c.comment) });
  } catch (e) {
    console.error("Повідомлення про правку табеля не надіслано:", e);
  }
}

/** Ручне виправлення часу існуючої зміни (EDIT_SHIFTS перевіряє API-роут). Причина зі списку обов'язкова. */
export async function editShift(
  shiftId: number,
  input: { startedAt: Date; endedAt: Date | null; reason: string; comment: string },
  actorEmploymentId: number,
  allowClosedPeriod = false,
): Promise<EditResult> {
  const check = validateCorrectionInput(input);
  if (!check.ok) return check;

  const shift = await prisma.workShift.findUnique({ where: { id: shiftId } });
  if (!shift) return { ok: false, error: "Зміну не знайдено" };
  if (shift.cancelledAt) return { ok: false, error: "Зміну скасовано, виправити її не можна" };

  const periodClosed = isPeriodClosed(shift.startedAt) || isPeriodClosed(input.startedAt);
  if (periodClosed && !allowClosedPeriod) return { ok: false, error: "Період закрито (після 15 числа наступного місяця): правку може внести лише COO чи власник" };

  const problem = await validateInterval(shift.employmentId, input.startedAt, input.endedAt, shiftId);
  if (problem) return { ok: false, error: problem };

  await prisma.workShift.update({
    where: { id: shiftId },
    data: {
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      closeKind: input.endedAt ? ShiftCloseKind.MANUAL : null,
      editedAt: new Date(),
      editedById: actorEmploymentId,
      editReason: reasonText(check.reason, check.comment),
    },
  });
  await logAudit({
    actorId: actorEmploymentId,
    action: "shift.edited",
    entityType: "WorkShift",
    entityId: shiftId,
    diff: {
      reason: reasonText(check.reason, check.comment),
      before: { startedAt: shift.startedAt.toISOString(), endedAt: shift.endedAt?.toISOString() ?? null, closeKind: shift.closeKind },
      after: { startedAt: input.startedAt.toISOString(), endedAt: input.endedAt?.toISOString() ?? null },
    },
  });
  await recordCorrection({
    kind: TimesheetCorrectionKind.EDIT,
    shiftId,
    employmentId: shift.employmentId,
    orgNodeId: shift.orgNodeId,
    reason: check.reason,
    comment: check.comment,
    before: { startedAt: shift.startedAt, endedAt: shift.endedAt },
    after: { startedAt: input.startedAt, endedAt: input.endedAt },
    actorEmploymentId,
    periodClosed,
  });
  return { ok: true, shiftId };
}

/** Додає зміну вручну — працівник не відмітився взагалі (забув бейдж, зламаний сканер). */
export async function createManualShift(
  input: { employmentId: number; orgNodeId: number; startedAt: Date; endedAt: Date; reason: string; comment: string },
  actorEmploymentId: number,
  allowClosedPeriod = false,
): Promise<EditResult> {
  const check = validateCorrectionInput(input);
  if (!check.ok) return check;

  const employment = await prisma.employment.findUnique({ where: { id: input.employmentId } });
  if (!employment || employment.status === EmploymentStatus.TERMINATED) return { ok: false, error: "Працівника не знайдено або звільнено" };

  const periodClosed = isPeriodClosed(input.startedAt);
  if (periodClosed && !allowClosedPeriod) return { ok: false, error: "Період закрито (після 15 числа наступного місяця): правку може внести лише COO чи власник" };

  const problem = await validateInterval(input.employmentId, input.startedAt, input.endedAt, null);
  if (problem) return { ok: false, error: problem };

  const shift = await prisma.workShift.create({
    data: {
      employmentId: input.employmentId,
      orgNodeId: input.orgNodeId,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      closeKind: ShiftCloseKind.MANUAL,
      editedAt: new Date(),
      editedById: actorEmploymentId,
      editReason: reasonText(check.reason, check.comment),
    },
  });
  await logAudit({
    actorId: actorEmploymentId,
    action: "shift.created",
    entityType: "WorkShift",
    entityId: shift.id,
    diff: { reason: reasonText(check.reason, check.comment), employmentId: input.employmentId, startedAt: input.startedAt.toISOString(), endedAt: input.endedAt.toISOString() },
  });
  await recordCorrection({
    kind: TimesheetCorrectionKind.CREATE,
    shiftId: shift.id,
    employmentId: input.employmentId,
    orgNodeId: input.orgNodeId,
    reason: check.reason,
    comment: check.comment,
    before: null,
    after: { startedAt: input.startedAt, endedAt: input.endedAt },
    actorEmploymentId,
    periodClosed,
  });
  return { ok: true, shiftId: shift.id };
}

/** Скасування помилкової чи дубльованої зміни: вона лишається в журналі, але не рахується в годинах. */
export async function cancelShift(
  shiftId: number,
  input: CorrectionInput,
  actorEmploymentId: number,
  allowClosedPeriod = false,
): Promise<EditResult> {
  const check = validateCorrectionInput(input);
  if (!check.ok) return check;

  const shift = await prisma.workShift.findUnique({ where: { id: shiftId } });
  if (!shift) return { ok: false, error: "Зміну не знайдено" };
  if (shift.cancelledAt) return { ok: false, error: "Зміну вже скасовано" };

  const periodClosed = isPeriodClosed(shift.startedAt);
  if (periodClosed && !allowClosedPeriod) return { ok: false, error: "Період закрито (після 15 числа наступного місяця): правку може внести лише COO чи власник" };

  await prisma.workShift.update({
    where: { id: shiftId },
    // Відкриту зміну закриваємо нульовою тривалістю, щоб термінал не вважав її відкритою.
    data: { cancelledAt: new Date(), cancelledById: actorEmploymentId, endedAt: shift.endedAt ?? shift.startedAt, editedAt: new Date(), editedById: actorEmploymentId, editReason: `Скасовано. ${reasonText(check.reason, check.comment)}` },
  });
  await logAudit({
    actorId: actorEmploymentId,
    action: "shift.cancelled",
    entityType: "WorkShift",
    entityId: shiftId,
    diff: { reason: reasonText(check.reason, check.comment), before: { startedAt: shift.startedAt.toISOString(), endedAt: shift.endedAt?.toISOString() ?? null } },
  });
  await recordCorrection({
    kind: TimesheetCorrectionKind.CANCEL,
    shiftId,
    employmentId: shift.employmentId,
    orgNodeId: shift.orgNodeId,
    reason: check.reason,
    comment: check.comment,
    before: { startedAt: shift.startedAt, endedAt: shift.endedAt },
    after: null,
    actorEmploymentId,
    periodClosed,
  });
  return { ok: true, shiftId };
}

/**
 * Нічна/погодинна перевірка (bot/index.ts): зміна, відкрита довше 16 год,
 * закривається тривалістю 6 год від прибуття (рішення 2026-10-18), із записом
 * у журнал і одним зведеним повідомленням адміну магазину на запуск.
 */
export async function autoCloseStaleShifts(now: Date = new Date()): Promise<{ closed: number }> {
  const stale = await prisma.workShift.findMany({
    where: { endedAt: null, startedAt: { lt: new Date(now.getTime() - STALE_SHIFT_HOURS * HOUR_MS) } },
    include: { orgNode: true, employment: { include: { person: true } } },
  });

  const byStore = new Map<number, { path: string; storeName: string; lines: string[] }>();
  for (const s of stale) {
    await prisma.workShift.update({
      where: { id: s.id },
      data: { endedAt: new Date(s.startedAt.getTime() + AUTO_CLOSE_SHIFT_HOURS * HOUR_MS), closeKind: ShiftCloseKind.AUTO },
    });
    const autoEnd = new Date(s.startedAt.getTime() + AUTO_CLOSE_SHIFT_HOURS * HOUR_MS);
    await prisma.timesheetCorrection.create({
      data: {
        kind: TimesheetCorrectionKind.AUTO_CLOSE,
        shiftId: s.id,
        employmentId: s.employmentId,
        orgNodeId: s.orgNodeId,
        reason: TimesheetCorrectionReason.AUTO_CLOSE,
        beforeStartedAt: s.startedAt,
        afterStartedAt: s.startedAt,
        afterEndedAt: autoEnd,
        beforeMinutes: 0,
        afterMinutes: AUTO_CLOSE_SHIFT_HOURS * HOUR_MIN,
        deltaMinutes: AUTO_CLOSE_SHIFT_HOURS * HOUR_MIN,
        actorId: null,
        periodClosed: false,
      },
    });
    await logAudit({
      actorId: null,
      action: "shift.autoClosed",
      entityType: "WorkShift",
      entityId: s.id,
      diff: { startedAt: s.startedAt.toISOString(), assignedHours: AUTO_CLOSE_SHIFT_HOURS },
    });

    const entry = byStore.get(s.orgNodeId) ?? { path: s.orgNode.path, storeName: s.orgNode.name, lines: [] };
    entry.lines.push(`• ${s.employment.person.fullName} — зміна від ${s.startedAt.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`);
    byStore.set(s.orgNodeId, entry);
  }

  for (const entry of byStore.values()) {
    const adminEmploymentId = await resolveAssignee(Role.STORE_ADMIN, entry.path);
    if (!adminEmploymentId) continue;
    const admin = await prisma.employment.findUnique({ where: { id: adminEmploymentId } });
    if (!admin) continue;
    await sendNotification(admin.personId, "shift.autoClosed", {
      storeName: entry.storeName,
      hours: String(AUTO_CLOSE_SHIFT_HOURS),
      list: entry.lines.join("\n"),
    });
  }

  return { closed: stale.length };
}
