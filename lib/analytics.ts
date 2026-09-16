import { prisma } from "./prisma";
import { hasAccess } from "./access";
import { getEffectiveGrants } from "./permissions";
import { getCompetencyDelta } from "./competencies";
import { Capability, EmploymentStatus, OrgNodeType } from "../generated/prisma/client";

/**
 * Області, у яких людина має VIEW_ANALYTICS — окремо від VIEW_EMPLOYEE
 * (docs catalogs-v1.1 §4.4: категорійний менеджер бачить аналітику по всій
 * компанії, але картки конкретних працівників — тільки своїх підлеглих).
 */
export async function getAnalyticsScopePaths(personId: number): Promise<string[]> {
  const grants = await getEffectiveGrants(personId);
  const paths = new Set<string>();
  for (const grant of grants) {
    if (grant.capability === Capability.VIEW_ANALYTICS && grant.scopePath) paths.add(grant.scopePath);
  }
  return [...paths];
}

function coveredByScope(scopePaths: string[], targetPath: string): boolean {
  return scopePaths.some((scopePath) => hasAccess(scopePath, targetPath));
}

export type StaffingRow = { positionProfileId: number; title: string; planned: number; actual: number; gap: number };
export type StaffingObject = {
  objectId: number;
  objectName: string;
  roster: StaffingRow[];
  totalPlanned: number;
  totalActual: number;
  totalGap: number;
};

/** Укомплектованість по мережі: план/факт по посадах у межах кожного видимого об'єкта (docs plan-v1 §5.3, §6). */
export async function getStaffingAnalytics(scopePaths: string[]): Promise<StaffingObject[]> {
  const objects = await prisma.orgNode.findMany({ where: { type: OrgNodeType.OBJECT, isActive: true } });
  const visibleObjects = objects.filter((o) => coveredByScope(scopePaths, o.path));

  const result: StaffingObject[] = [];
  for (const obj of visibleObjects) {
    const subtreeNodes = await prisma.orgNode.findMany({
      where: { OR: [{ id: obj.id }, { path: { startsWith: `${obj.path}.` } }] },
      select: { id: true },
    });
    const subtreeIds = subtreeNodes.map((n) => n.id);

    const staffUnits = await prisma.staffUnit.findMany({
      where: { orgNodeId: { in: subtreeIds } },
      include: {
        positionProfile: { select: { id: true, title: true } },
        employments: { where: { status: { not: EmploymentStatus.TERMINATED } } },
      },
    });

    const rosterMap = new Map<number, StaffingRow>();
    for (const staffUnit of staffUnits) {
      const entry = rosterMap.get(staffUnit.positionProfileId) ?? {
        positionProfileId: staffUnit.positionProfileId,
        title: staffUnit.positionProfile.title,
        planned: 0,
        actual: 0,
        gap: 0,
      };
      entry.planned += staffUnit.plannedHeadcount;
      entry.actual += staffUnit.employments.length;
      rosterMap.set(staffUnit.positionProfileId, entry);
    }

    const roster = [...rosterMap.values()]
      .map((r) => ({ ...r, gap: r.planned - r.actual }))
      .sort((a, b) => a.title.localeCompare(b.title, "uk"));
    const totalPlanned = roster.reduce((sum, r) => sum + r.planned, 0);
    const totalActual = roster.reduce((sum, r) => sum + r.actual, 0);

    result.push({ objectId: obj.id, objectName: obj.name, roster, totalPlanned, totalActual, totalGap: totalPlanned - totalActual });
  }

  return result.sort((a, b) => a.objectName.localeCompare(b.objectName, "uk"));
}

export type TurnoverReasonRow = { code: string; name: string; count: number };
export type TurnoverObjectRow = { objectId: number; objectName: string; terminated: number; currentHeadcount: number; ratePercent: number };
export type TurnoverAnalytics = {
  months: number;
  totalTerminated: number;
  overallRatePercent: number;
  byReason: TurnoverReasonRow[];
  byObject: TurnoverObjectRow[];
};

/**
 * Плинність за період (docs plan-v1 §6, catalogs-v1.1 §8.1 — "аналітика
 * плинності"). Докс не дає формули — узято стандартну, спрощену під
 * відсутність історичних знімків чисельності: ставка = звільнені_за_період /
 * (поточна_чисельність + звільнені_за_період), тобто відносно всіх, хто
 * був у штаті хоч якийсь час протягом періоду. Без щоденних знімків
 * точнішу "середню чисельність" порахувати нема з чого.
 */
export async function getTurnoverAnalytics(scopePaths: string[], monthsBack: number): Promise<TurnoverAnalytics> {
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);

  const objects = await prisma.orgNode.findMany({ where: { type: OrgNodeType.OBJECT, isActive: true } });
  const visibleObjects = objects.filter((o) => coveredByScope(scopePaths, o.path));

  const reasonTotals = new Map<string, TurnoverReasonRow>();
  const byObject: TurnoverObjectRow[] = [];
  let totalTerminated = 0;
  let totalCurrent = 0;

  for (const obj of visibleObjects) {
    const subtreeNodes = await prisma.orgNode.findMany({
      where: { OR: [{ id: obj.id }, { path: { startsWith: `${obj.path}.` } }] },
      select: { id: true },
    });
    const subtreeIds = subtreeNodes.map((n) => n.id);

    const [terminated, currentHeadcount] = await Promise.all([
      prisma.employment.findMany({
        where: { status: EmploymentStatus.TERMINATED, terminatedAt: { gte: from }, staffUnit: { orgNodeId: { in: subtreeIds } } },
        include: { terminationReason: true },
      }),
      prisma.employment.count({ where: { status: { not: EmploymentStatus.TERMINATED }, staffUnit: { orgNodeId: { in: subtreeIds } } } }),
    ]);

    for (const emp of terminated) {
      const code = emp.terminationReasonCode ?? "UNKNOWN";
      const name = emp.terminationReason?.name ?? "Без причини";
      const entry = reasonTotals.get(code) ?? { code, name, count: 0 };
      entry.count += 1;
      reasonTotals.set(code, entry);
    }

    const base = currentHeadcount + terminated.length;
    byObject.push({
      objectId: obj.id,
      objectName: obj.name,
      terminated: terminated.length,
      currentHeadcount,
      ratePercent: base > 0 ? Math.round((terminated.length / base) * 1000) / 10 : 0,
    });

    totalTerminated += terminated.length;
    totalCurrent += currentHeadcount;
  }

  const overallBase = totalCurrent + totalTerminated;
  return {
    months: monthsBack,
    totalTerminated,
    overallRatePercent: overallBase > 0 ? Math.round((totalTerminated / overallBase) * 1000) / 10 : 0,
    byReason: [...reasonTotals.values()].sort((a, b) => b.count - a.count),
    byObject: byObject.sort((a, b) => b.terminated - a.terminated),
  };
}

export type ExpiringCompetencyRow = {
  personId: number;
  fullName: string;
  positionTitle: string;
  objectId: number;
  objectName: string;
  competencyName: string;
  validUntil: string;
  state: "expired" | "expiring";
  daysLeft: number;
};

/** Строки компетенцій, що спливають, по всій видимій мережі (docs v1.2 §6). */
export async function getExpiringCompetencies(scopePaths: string[], monthsAhead: number): Promise<ExpiringCompetencyRow[]> {
  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() + monthsAhead);
  const now = new Date();

  const employments = await prisma.employment.findMany({
    where: { status: EmploymentStatus.ACTIVE },
    include: { person: true, staffUnit: { include: { orgNode: true, positionProfile: true } } },
  });

  const rows: ExpiringCompetencyRow[] = [];
  for (const employment of employments) {
    if (!coveredByScope(scopePaths, employment.staffUnit.orgNode.path)) continue;

    const delta = await getCompetencyDelta(employment.personId, employment.staffUnit.positionProfileId);
    for (const row of delta) {
      if (!row.validUntil) continue;
      if (row.state !== "expired" && row.validUntil > threshold) continue;

      const daysLeft = Math.round((row.validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      rows.push({
        personId: employment.personId,
        fullName: employment.person.fullName,
        positionTitle: employment.staffUnit.positionProfile.title,
        objectId: employment.staffUnit.orgNode.id,
        objectName: employment.staffUnit.orgNode.name,
        competencyName: row.name,
        validUntil: row.validUntil.toISOString(),
        state: row.state === "expired" ? "expired" : "expiring",
        daysLeft,
      });
    }
  }

  rows.sort((a, b) => a.validUntil.localeCompare(b.validUntil));
  return rows;
}
