import { prisma } from "./prisma";
import { hasAccess } from "./access";
import { FREQUENT_CORRECTIONS_THRESHOLD, REASON_LABELS } from "./timesheetReasons";
import { TimesheetCorrectionKind } from "../generated/prisma/client";

export type JournalFilters = {
  from: Date;
  to: Date;
  orgNodeId?: number | null;
  employmentId?: number | null;
  actorId?: number | null;
  reason?: string | null;
  /** Показувати й автозакриття забутих змін (за замовчуванням так). */
  includeAuto?: boolean;
};

export type JournalRow = {
  id: number;
  createdAt: string;
  kind: string;
  employmentId: number;
  employeeName: string;
  positionTitle: string;
  storeName: string;
  shiftDate: string;
  beforeStartedAt: string | null;
  beforeEndedAt: string | null;
  afterStartedAt: string | null;
  afterEndedAt: string | null;
  deltaMinutes: number;
  reason: string;
  reasonLabel: string;
  comment: string | null;
  actorId: number | null;
  actorName: string;
  periodClosed: boolean;
};

export type JournalSummary = {
  total: number;
  manualCount: number;
  autoCount: number;
  addedMinutes: number;
  removedMinutes: number;
  closedPeriodCount: number;
  byReason: { reason: string; label: string; count: number }[];
  byActor: { actorId: number | null; name: string; count: number; netMinutes: number }[];
  byEmployee: { employmentId: number; name: string; count: number; netMinutes: number; frequent: boolean }[];
};

export type JournalResult = {
  rows: JournalRow[];
  summary: JournalSummary;
  options: { stores: { id: number; name: string }[]; employees: { id: number; name: string }[]; actors: { id: number; name: string }[] };
};

const SYSTEM_ACTOR = "Система";

/**
 * Журнал правок табеля за період (за датою самої зміни, а не часом правки — як у табелі).
 * Права: лише магазини з області VIEW_TIMESHEET. Фільтри працівник/автор/причина
 * застосовуються в пам'яті, щоб списки вибору лишались повними для періоду.
 */
export async function getJournal(scopePaths: string[], f: JournalFilters): Promise<JournalResult> {
  const raw = await prisma.timesheetCorrection.findMany({
    where: {
      ...(f.orgNodeId ? { orgNodeId: f.orgNodeId } : {}),
      OR: [{ afterStartedAt: { gte: f.from, lt: f.to } }, { afterStartedAt: null, beforeStartedAt: { gte: f.from, lt: f.to } }],
    },
    include: {
      orgNode: true,
      actor: { include: { person: true } },
      employment: { include: { person: true, staffUnit: { include: { positionProfile: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  const visible = raw.filter((c) => scopePaths.some((p) => hasAccess(p, c.orgNode.path)));

  const toRow = (c: (typeof visible)[number]): JournalRow => ({
    id: c.id,
    createdAt: c.createdAt.toISOString(),
    kind: c.kind,
    employmentId: c.employmentId,
    employeeName: c.employment.person.fullName,
    positionTitle: c.employment.staffUnit.positionProfile.title,
    storeName: c.orgNode.name,
    shiftDate: (c.afterStartedAt ?? c.beforeStartedAt ?? c.createdAt).toISOString(),
    beforeStartedAt: c.beforeStartedAt?.toISOString() ?? null,
    beforeEndedAt: c.beforeEndedAt?.toISOString() ?? null,
    afterStartedAt: c.afterStartedAt?.toISOString() ?? null,
    afterEndedAt: c.afterEndedAt?.toISOString() ?? null,
    deltaMinutes: c.deltaMinutes,
    reason: c.reason,
    reasonLabel: REASON_LABELS[c.reason] ?? c.reason,
    comment: c.comment,
    actorId: c.actorId,
    actorName: c.actor?.person.fullName ?? SYSTEM_ACTOR,
    periodClosed: c.periodClosed,
  });
  const allRows = visible.map(toRow);

  const options: JournalResult["options"] = {
    stores: [...new Map(visible.map((c) => [c.orgNodeId, c.orgNode.name])).entries()].map(([id, name]) => ({ id, name })),
    employees: [...new Map(allRows.map((r) => [r.employmentId, r.employeeName])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "uk")),
    actors: [...new Map(allRows.filter((r) => r.actorId).map((r) => [r.actorId as number, r.actorName])).entries()].map(([id, name]) => ({ id, name })),
  };

  const includeAuto = f.includeAuto !== false;
  const rows = allRows.filter(
    (r) =>
      (!f.employmentId || r.employmentId === f.employmentId) &&
      (!f.actorId || r.actorId === f.actorId) &&
      (!f.reason || r.reason === f.reason) &&
      (includeAuto || r.kind !== TimesheetCorrectionKind.AUTO_CLOSE),
  );

  const manual = rows.filter((r) => r.kind !== TimesheetCorrectionKind.AUTO_CLOSE);
  const reasonCount = new Map<string, number>();
  const actorAgg = new Map<number | null, { name: string; count: number; netMinutes: number }>();
  const employeeAgg = new Map<number, { name: string; count: number; netMinutes: number }>();
  let added = 0;
  let removed = 0;
  for (const r of rows) {
    reasonCount.set(r.reason, (reasonCount.get(r.reason) ?? 0) + 1);
    if (r.deltaMinutes > 0) added += r.deltaMinutes;
    else removed += -r.deltaMinutes;
  }
  for (const r of manual) {
    const a = actorAgg.get(r.actorId) ?? { name: r.actorName, count: 0, netMinutes: 0 };
    a.count += 1;
    a.netMinutes += r.deltaMinutes;
    actorAgg.set(r.actorId, a);
    const e = employeeAgg.get(r.employmentId) ?? { name: r.employeeName, count: 0, netMinutes: 0 };
    e.count += 1;
    e.netMinutes += r.deltaMinutes;
    employeeAgg.set(r.employmentId, e);
  }

  const summary: JournalSummary = {
    total: rows.length,
    manualCount: manual.length,
    autoCount: rows.length - manual.length,
    addedMinutes: added,
    removedMinutes: removed,
    closedPeriodCount: rows.filter((r) => r.periodClosed).length,
    byReason: [...reasonCount.entries()].map(([reason, count]) => ({ reason, label: REASON_LABELS[reason] ?? reason, count })).sort((a, b) => b.count - a.count),
    byActor: [...actorAgg.entries()].map(([actorId, v]) => ({ actorId, ...v })).sort((a, b) => b.count - a.count),
    byEmployee: [...employeeAgg.entries()]
      .map(([employmentId, v]) => ({ employmentId, ...v, frequent: v.count >= FREQUENT_CORRECTIONS_THRESHOLD }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
  return { rows, summary, options };
}

/** Розбір ?month=YYYY-MM та інших параметрів журналу (спільне для сторінки й експорту). */
export function parseJournalParams(sp: URLSearchParams): { ok: true; filters: JournalFilters } | { ok: false; error: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(sp.get("month") ?? "");
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) - 1 : now.getMonth();
  if (month < 0 || month > 11) return { ok: false, error: "Невірний місяць" };
  const num = (k: string) => {
    const v = Number(sp.get(k));
    return Number.isInteger(v) && v > 0 ? v : null;
  };
  return {
    ok: true,
    filters: {
      from: new Date(year, month, 1),
      to: new Date(year, month + 1, 1),
      orgNodeId: num("objectId"),
      employmentId: num("employmentId"),
      actorId: num("actorId"),
      reason: sp.get("reason") || null,
      includeAuto: sp.get("auto") !== "0",
    },
  };
}
