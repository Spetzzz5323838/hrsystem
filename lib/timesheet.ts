import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { hasAccess } from "./access";
import { getEffectiveGrants } from "./permissions";
import { resolveAssignee } from "./onboarding";
import { sendNotification } from "./notificationTemplates";
import { Capability, EmploymentStatus, Role, ShiftCloseKind } from "../generated/prisma/client";

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
};

export type TimesheetEmployee = {
  employmentId: number;
  fullName: string;
  positionTitle: string;
  totalMinutes: number;
  shiftCount: number;
  autoClosedCount: number;
  editedCount: number;
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

  const now = Date.now();
  const byEmployment = new Map<number, TimesheetEmployee>();
  for (const s of shifts) {
    if (!scopePaths.some((p) => hasAccess(p, s.orgNode.path))) continue;

    const minutes = Math.max(0, Math.round(((s.endedAt?.getTime() ?? now) - s.startedAt.getTime()) / 60000));
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
        hasOpenShift: false,
        shifts: [],
      };
      byEmployment.set(s.employmentId, row);
    }
    row.totalMinutes += minutes;
    row.shiftCount += 1;
    if (s.closeKind === ShiftCloseKind.AUTO) row.autoClosedCount += 1;
    if (s.editedAt) row.editedCount += 1;
    if (!s.endedAt) row.hasOpenShift = true;
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
      ...(ignoreShiftId ? { id: { not: ignoreShiftId } } : {}),
      startedAt: { lt: endedAt ?? new Date(8.64e15) },
      OR: [{ endedAt: null }, { endedAt: { gt: startedAt } }],
    },
  });
  return overlapping ? "Перетинається з іншою зміною цього працівника" : null;
}

/** Ручне виправлення часу існуючої зміни (EDIT_SHIFTS перевіряє API-роут). Причина обов'язкова. */
export async function editShift(
  shiftId: number,
  input: { startedAt: Date; endedAt: Date | null; reason: string },
  actorEmploymentId: number,
): Promise<EditResult> {
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, error: "Вкажіть причину виправлення" };

  const shift = await prisma.workShift.findUnique({ where: { id: shiftId } });
  if (!shift) return { ok: false, error: "Зміну не знайдено" };

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
      editReason: reason,
    },
  });
  await logAudit({
    actorId: actorEmploymentId,
    action: "shift.edited",
    entityType: "WorkShift",
    entityId: shiftId,
    diff: {
      reason,
      before: { startedAt: shift.startedAt.toISOString(), endedAt: shift.endedAt?.toISOString() ?? null, closeKind: shift.closeKind },
      after: { startedAt: input.startedAt.toISOString(), endedAt: input.endedAt?.toISOString() ?? null },
    },
  });
  return { ok: true, shiftId };
}

/** Додає зміну вручну — працівник не відмітився взагалі (забув бейдж, зламаний сканер). */
export async function createManualShift(
  input: { employmentId: number; orgNodeId: number; startedAt: Date; endedAt: Date; reason: string },
  actorEmploymentId: number,
): Promise<EditResult> {
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, error: "Вкажіть причину" };

  const employment = await prisma.employment.findUnique({ where: { id: input.employmentId } });
  if (!employment || employment.status === EmploymentStatus.TERMINATED) return { ok: false, error: "Працівника не знайдено або звільнено" };

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
      editReason: reason,
    },
  });
  await logAudit({
    actorId: actorEmploymentId,
    action: "shift.created",
    entityType: "WorkShift",
    entityId: shift.id,
    diff: { reason, employmentId: input.employmentId, startedAt: input.startedAt.toISOString(), endedAt: input.endedAt.toISOString() },
  });
  return { ok: true, shiftId: shift.id };
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
