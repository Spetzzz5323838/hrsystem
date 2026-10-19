import { prisma } from "./prisma";
import { hasAccess } from "./access";
import { OrgNodeType } from "../generated/prisma/client";

/** Верхня межа періоду звіту — щоб не віддати в браузер таблицю на пів року. */
export const MAX_REPORT_DAYS = 93;

export type DailyReportRow = {
  employmentId: number;
  fullName: string;
  positionTitle: string;
  unitId: number;
  unitName: string;
  unitPath: string;
  /** Хвилини по днях: ключ "РРРР-ММ-ДД". Дні без змін відсутні. */
  minutesByDay: Record<string, number>;
  totalMinutes: number;
  hasOpenShift: boolean;
};

export type DailyReport = {
  /** Усі календарні дні періоду, "РРРР-ММ-ДД". */
  days: string[];
  rows: DailyReportRow[];
  dayTotals: Record<string, number>;
  grandTotalMinutes: number;
};

export type UnitOption = { id: number; name: string; type: OrgNodeType; depth: number };

const pad = (n: number) => String(n).padStart(2, "0");
const segments = (path: string) => path.split(".").map(Number);

/** Порівняння шляхів дерева по сегментах: батько йде перед дітьми. */
function comparePaths(a: string, b: string): number {
  const x = segments(a);
  const y = segments(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

/** Ключ календарного дня за локальним часом сервера. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Фільтри звіту з адресного рядка (спільні для екрана й Excel): from, to, unitId, q. */
export function parseReportParams(params: URLSearchParams): { ok: true; from: Date; to: Date; unitId: number | null; search: string } | { ok: false; error: string } {
  const now = new Date();
  const from = parseDayKey(params.get("from")) ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const to = parseDayKey(params.get("to")) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (to < from) return { ok: false, error: "Дата «по» раніше за дату «з»" };
  if ((to.getTime() - from.getTime()) / 86_400_000 + 1 > MAX_REPORT_DAYS) return { ok: false, error: `Період не може бути довшим за ${MAX_REPORT_DAYS} днів` };
  const unitParam = params.get("unitId");
  const unitId = unitParam ? Number(unitParam) : null;
  if (unitParam && !Number.isInteger(unitId)) return { ok: false, error: "Невірний підрозділ" };
  return { ok: true, from, to, unitId, search: params.get("q") ?? "" };
}

/** "РРРР-ММ-ДД" → північ цього дня за локальним часом; null, якщо формат невірний. */
export function parseDayKey(text: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dayKey(d) === text ? d : null;
}

/**
 * Звіт "працівник × календарний день" (рішення власника 2026-10-19).
 * - Зміна належить дню ПОЧАТКУ (як і в місячному табелі); нічна зміна не ріжеться по півночі.
 * - Працівник належить до підрозділу, де він працевлаштований (StaffUnit), а не до магазину,
 *   де відмітився: фільтр і права рахуються по вузлу посади.
 * - Відкрита зміна рахується до "зараз" і позначається.
 * Права: працівник потрапляє в звіт, лише якщо його вузол у зоні scopePaths.
 */
export async function getDailyReport(
  scopePaths: string[],
  fromDay: Date,
  toDay: Date,
  unitId: number | null,
  search: string,
): Promise<DailyReport> {
  const days: string[] = [];
  for (let d = new Date(fromDay); d <= toDay; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(dayKey(d));

  const unit = unitId ? await prisma.orgNode.findUnique({ where: { id: unitId } }) : null;
  const term = search.trim();

  const shifts = await prisma.workShift.findMany({
    where: {
      startedAt: { gte: fromDay, lt: new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1) },
      employment: term ? { person: { fullName: { contains: term, mode: "insensitive" } } } : undefined,
    },
    include: { employment: { include: { person: true, staffUnit: { include: { orgNode: true, positionProfile: true } } } } },
    orderBy: { startedAt: "asc" },
  });

  const now = Date.now();
  const byEmployment = new Map<number, DailyReportRow>();
  for (const s of shifts) {
    const node = s.employment.staffUnit.orgNode;
    if (!scopePaths.some((p) => hasAccess(p, node.path))) continue;
    if (unit && !hasAccess(unit.path, node.path)) continue;

    const minutes = Math.max(0, Math.round(((s.endedAt?.getTime() ?? now) - s.startedAt.getTime()) / 60000));
    let row = byEmployment.get(s.employmentId);
    if (!row) {
      row = {
        employmentId: s.employmentId,
        fullName: s.employment.person.fullName,
        positionTitle: s.employment.staffUnit.positionProfile.title,
        unitId: node.id,
        unitName: node.name,
        unitPath: node.path,
        minutesByDay: {},
        totalMinutes: 0,
        hasOpenShift: false,
      };
      byEmployment.set(s.employmentId, row);
    }
    const key = dayKey(s.startedAt);
    row.minutesByDay[key] = (row.minutesByDay[key] ?? 0) + minutes;
    row.totalMinutes += minutes;
    if (!s.endedAt) row.hasOpenShift = true;
  }

  // Спочатку за місцем у дереві (щоб групи йшли в порядку структури), у групі — за ПІБ.
  const rows = [...byEmployment.values()].sort((a, b) => comparePaths(a.unitPath, b.unitPath) || a.fullName.localeCompare(b.fullName, "uk"));
  const dayTotals: Record<string, number> = {};
  let grandTotalMinutes = 0;
  for (const r of rows) {
    grandTotalMinutes += r.totalMinutes;
    for (const [k, v] of Object.entries(r.minutesByDay)) dayTotals[k] = (dayTotals[k] ?? 0) + v;
  }
  return { days, rows, dayTotals, grandTotalMinutes };
}

/** Підрозділи в зоні доступу, у порядку дерева, з відступом за глибиною — для випадного списку фільтра. */
export async function listUnitOptions(scopePaths: string[]): Promise<UnitOption[]> {
  const nodes = await prisma.orgNode.findMany({ where: { isActive: true } });
  return nodes
    .filter((n) => scopePaths.some((p) => hasAccess(p, n.path)))
    .sort((a, b) => comparePaths(a.path, b.path))
    .map((n) => ({ id: n.id, name: n.name, type: n.type, depth: segments(n.path).length - 1 }));
}

/**
 * Відпрацьований час людини за календарний місяць — для кнопки в боті.
 * Той самий облік, що й у звітах: зміна належить місяцю за часом початку,
 * відкрита зміна рахується до "зараз". Беремо всі працевлаштування людини
 * (повторний найм, переведення), але лише її власні зміни.
 */
export async function getPersonMonthMinutes(personId: number, year: number, month: number): Promise<{ minutes: number; hasOpenShift: boolean }> {
  const shifts = await prisma.workShift.findMany({
    where: { employment: { personId }, startedAt: { gte: new Date(year, month, 1), lt: new Date(year, month + 1, 1) } },
    select: { startedAt: true, endedAt: true },
  });
  const now = Date.now();
  let minutes = 0;
  let hasOpenShift = false;
  for (const s of shifts) {
    if (!s.endedAt) hasOpenShift = true;
    minutes += Math.max(0, Math.round(((s.endedAt?.getTime() ?? now) - s.startedAt.getTime()) / 60000));
  }
  return { minutes, hasOpenShift };
}
