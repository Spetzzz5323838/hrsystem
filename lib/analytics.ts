import { prisma } from "./prisma";
import { hasAccess } from "./access";
import { getEffectiveGrants } from "./permissions";
import { getCompetencyDelta } from "./competencies";
import { getInstanceTasks } from "./onboarding";
import { Capability, EmploymentStatus, OrgNodeType, ProcessType, ProcessState, RatingType } from "../generated/prisma/client";

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

export type FunnelStageCount = { status: string; label: string; count: number };
export type FunnelStageDuration = { key: string; label: string; avgHours: number | null; sampleSize: number };
export type HiringFunnelAnalytics = {
  months: number;
  totalStarted: number;
  currentByStage: FunnelStageCount[];
  completed: number;
  abandoned: number;
  stageDurations: FunnelStageDuration[];
  totalDurationHours: number | null;
  totalDurationSampleSize: number;
};

const FUNNEL_STAGE_LABELS: Record<string, string> = {
  REGISTERED: "Зареєстрований",
  ACTIVATED: "Активовано",
  DOCUMENTS_PENDING: "Оформлення в 1С/бухгалтерії",
  TRAINEE: "Стажується",
  READY_FOR_ATTESTATION: "Чекає на атестацію",
  ACTIVE: "Активний (завершує чек-лист)",
};

const FUNNEL_STAGE_ORDER: EmploymentStatus[] = [
  EmploymentStatus.REGISTERED,
  EmploymentStatus.ACTIVATED,
  EmploymentStatus.DOCUMENTS_PENDING,
  EmploymentStatus.TRAINEE,
  EmploymentStatus.READY_FOR_ATTESTATION,
  EmploymentStatus.ACTIVE,
];

/** entityType завжди "Employment", тож onboarding-переходи однієї людини не сплутати з чужими. */
const AUDIT_STAGE_DEFS: { key: string; label: string; fromAction: string | null; toAction: string }[] = [
  { key: "toDocumentsPending", label: "Реєстрація → призначення куратора", fromAction: null, toAction: "onboarding.documentsPending" },
  { key: "toTrainee", label: "Оформлення прийому (заява, наказ)", fromAction: "onboarding.documentsPending", toAction: "onboarding.traineeStarted" },
  {
    key: "toReadyForAttestation",
    label: "Стажування під наглядом куратора",
    fromAction: "onboarding.traineeStarted",
    toAction: "onboarding.readyForAttestation",
  },
  { key: "toActive", label: "Атестація", fromAction: "onboarding.readyForAttestation", toAction: "onboarding.activated" },
];

/**
 * Воронка найму (docs plan-v1 §6): скільки онбордингів зараз на кожному
 * етапі + скільки в середньому часу займає кожен перехід. Точні часові мітки
 * переходів пишуться в AuditLog лише з 2026-09-12 — процеси, що пройшли
 * потрібний перехід ДО цієї дати, у розрахунок середнього часу не
 * потрапляють (sampleSize менший за totalStarted), але в лійці "зараз на
 * етапі" враховані всі.
 */
export async function getHiringFunnelAnalytics(scopePaths: string[], monthsBack: number): Promise<HiringFunnelAnalytics> {
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);

  const instances = await prisma.processInstance.findMany({
    where: { template: { type: ProcessType.ONBOARDING }, startedAt: { gte: from } },
    include: { employment: { include: { staffUnit: { include: { orgNode: true } } } } },
  });
  const visible = instances.filter((i) => coveredByScope(scopePaths, i.employment.staffUnit.orgNode.path));

  const currentByStage = new Map<string, number>();
  for (const status of FUNNEL_STAGE_ORDER) currentByStage.set(status, 0);
  let completed = 0;
  let abandoned = 0;

  for (const instance of visible) {
    if (instance.state === ProcessState.DONE) {
      completed += 1;
    } else if (instance.employment.status === EmploymentStatus.TERMINATED) {
      abandoned += 1;
    } else if (currentByStage.has(instance.employment.status)) {
      currentByStage.set(instance.employment.status, (currentByStage.get(instance.employment.status) ?? 0) + 1);
    }
  }

  const employmentIds = visible.map((i) => i.employmentId);
  const logs = employmentIds.length
    ? await prisma.auditLog.findMany({
        where: {
          entityType: "Employment",
          entityId: { in: employmentIds },
          action: { in: AUDIT_STAGE_DEFS.map((d) => d.toAction) },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const logsByEmployment = new Map<number, Map<string, Date>>();
  for (const log of logs) {
    if (log.entityId == null) continue;
    const map = logsByEmployment.get(log.entityId) ?? new Map<string, Date>();
    if (!map.has(log.action)) map.set(log.action, log.createdAt);
    logsByEmployment.set(log.entityId, map);
  }

  const stageDurations: FunnelStageDuration[] = AUDIT_STAGE_DEFS.map((def) => {
    let totalHours = 0;
    let sampleSize = 0;
    for (const instance of visible) {
      const map = logsByEmployment.get(instance.employmentId);
      const to = map?.get(def.toAction);
      if (!to) continue;
      const fromTs = def.fromAction ? map?.get(def.fromAction) : instance.startedAt;
      if (!fromTs) continue;
      totalHours += (to.getTime() - fromTs.getTime()) / (1000 * 60 * 60);
      sampleSize += 1;
    }
    return { key: def.key, label: def.label, avgHours: sampleSize > 0 ? Math.round((totalHours / sampleSize) * 10) / 10 : null, sampleSize };
  });

  let totalDurationHours = 0;
  let totalDurationSampleSize = 0;
  for (const instance of visible) {
    const activatedAt = logsByEmployment.get(instance.employmentId)?.get("onboarding.activated");
    if (!activatedAt) continue;
    totalDurationHours += (activatedAt.getTime() - instance.startedAt.getTime()) / (1000 * 60 * 60);
    totalDurationSampleSize += 1;
  }

  return {
    months: monthsBack,
    totalStarted: visible.length,
    currentByStage: FUNNEL_STAGE_ORDER.map((status) => ({
      status,
      label: FUNNEL_STAGE_LABELS[status],
      count: currentByStage.get(status) ?? 0,
    })),
    completed,
    abandoned,
    stageDurations,
    totalDurationHours: totalDurationSampleSize > 0 ? Math.round((totalDurationHours / totalDurationSampleSize) * 10) / 10 : null,
    totalDurationSampleSize,
  };
}

export type SlaByObjectRow = {
  objectId: number;
  objectName: string;
  onTime: number;
  late: number;
  currentlyOverdue: number;
  total: number;
  onTimePercent: number;
};
export type SlaByRoleRow = { role: string; onTime: number; late: number; currentlyOverdue: number; total: number; onTimePercent: number };
export type SlaDisciplineAnalytics = {
  months: number;
  onTime: number;
  late: number;
  currentlyOverdue: number;
  total: number;
  onTimePercent: number;
  escalated: number;
  byObject: SlaByObjectRow[];
  byRole: SlaByRoleRow[];
};

/**
 * Дисципліна за SLA (docs plan-v1 §6, catalogs-v1.1 §8.1). Рахує тільки
 * пункти чек-ліста з заданим `slaHours` (тобто з реальним `dueAt`) —
 * пункти без нормативу до розрахунку не потрапляють. `onTimePercent`
 * рахується лише по ЗАВЕРШЕНИХ пунктах (onTime+late) — пункти, що ще
 * протерміновані, але не виконані (`currentlyOverdue`), у відсоток не
 * входять навмисно (це оперативний сигнал "зараз горить", не історична
 * дисципліна) і показуються окремим числом.
 */
export async function getSlaDisciplineAnalytics(scopePaths: string[], monthsBack: number): Promise<SlaDisciplineAnalytics> {
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);
  const now = new Date();

  const allNodes = await prisma.orgNode.findMany({ select: { id: true, path: true, type: true, name: true } });
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  function objectAncestor(path: string): { id: number; name: string } | null {
    const ids = path.split(".").map(Number);
    for (let i = ids.length - 1; i >= 0; i--) {
      const node = nodeById.get(ids[i]);
      if (node?.type === OrgNodeType.OBJECT) return { id: node.id, name: node.name };
    }
    return null;
  }

  const tasks = await prisma.task.findMany({
    where: { dueAt: { not: null }, instance: { startedAt: { gte: from } } },
    include: {
      itemTemplate: { select: { responsibleRole: true } },
      instance: { include: { employment: { include: { staffUnit: { include: { orgNode: true } } } } } },
    },
  });
  const visible = tasks.filter((t) => coveredByScope(scopePaths, t.instance.employment.staffUnit.orgNode.path));

  // Заблокований пункт у черзі може мати dueAt у минулому (він рахується
  // при СТВОРЕННІ задачі, не при розблокуванні, [[lib/sla.ts]]) — виконавець
  // фізично ще не міг за нього взятися, тож рахувати таке "протерміновано"
  // нечесно. Той самий blocked-фільтр, що й у checkSlaEscalations.
  const instanceIds = [...new Set(visible.map((t) => t.instanceId))];
  const blockedTaskIds = new Set<number>();
  for (const instanceId of instanceIds) {
    const views = await getInstanceTasks(instanceId);
    for (const v of views) {
      if (v.blocked) blockedTaskIds.add(v.taskId);
    }
  }

  let onTime = 0;
  let late = 0;
  let currentlyOverdue = 0;
  let escalated = 0;
  const objectBuckets = new Map<number, { name: string; onTime: number; late: number; currentlyOverdue: number }>();
  const roleBuckets = new Map<string, { onTime: number; late: number; currentlyOverdue: number }>();

  for (const task of visible) {
    if (task.escalatedAt) escalated += 1;

    const dueAt = task.dueAt!;
    let field: "onTime" | "late" | "currentlyOverdue" | null = null;
    if (task.completedAt) field = task.completedAt <= dueAt ? "onTime" : "late";
    else if (dueAt < now && !blockedTaskIds.has(task.id)) field = "currentlyOverdue";
    if (!field) continue;

    if (field === "onTime") onTime += 1;
    else if (field === "late") late += 1;
    else currentlyOverdue += 1;

    const obj = objectAncestor(task.instance.employment.staffUnit.orgNode.path);
    if (obj) {
      const entry = objectBuckets.get(obj.id) ?? { name: obj.name, onTime: 0, late: 0, currentlyOverdue: 0 };
      entry[field] += 1;
      objectBuckets.set(obj.id, entry);
    }

    const role = task.itemTemplate.responsibleRole ?? "SYSTEM";
    const roleEntry = roleBuckets.get(role) ?? { onTime: 0, late: 0, currentlyOverdue: 0 };
    roleEntry[field] += 1;
    roleBuckets.set(role, roleEntry);
  }

  const byObject: SlaByObjectRow[] = [...objectBuckets.entries()]
    .map(([objectId, b]) => {
      const total = b.onTime + b.late;
      return {
        objectId,
        objectName: b.name,
        onTime: b.onTime,
        late: b.late,
        currentlyOverdue: b.currentlyOverdue,
        total,
        onTimePercent: total > 0 ? Math.round((b.onTime / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.total + b.currentlyOverdue - (a.total + a.currentlyOverdue));

  const byRole: SlaByRoleRow[] = [...roleBuckets.entries()]
    .map(([role, b]) => {
      const total = b.onTime + b.late;
      return {
        role,
        onTime: b.onTime,
        late: b.late,
        currentlyOverdue: b.currentlyOverdue,
        total,
        onTimePercent: total > 0 ? Math.round((b.onTime / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.total + b.currentlyOverdue - (a.total + a.currentlyOverdue));

  const total = onTime + late;
  return {
    months: monthsBack,
    onTime,
    late,
    currentlyOverdue,
    total,
    onTimePercent: total > 0 ? Math.round((onTime / total) * 1000) / 10 : 0,
    escalated,
    byObject,
    byRole,
  };
}

export type RatingAuthorRow = {
  authorId: number;
  authorName: string;
  totalEvents: number;
  positiveCount: number;
  negativeCount: number;
  dominantKey: string | null;
  dominantSharePercent: number;
};
export type RatingAuthorAnalytics = {
  months: number;
  onlyNegative: RatingAuthorRow[];
  noRatings: { employmentId: number; fullName: string }[];
  sameEverything: RatingAuthorRow[];
};

const RATING_POSITIVE_TYPES = new Set<RatingType>([RatingType.POSITIVE, RatingType.AWARD]);
const RATING_NEGATIVE_TYPES = new Set<RatingType>([RatingType.NEGATIVE, RatingType.REPRIMAND]);
/** Узгоджено з користувачем (2026-09-16): менше подій — не показова вибірка, тож поріг для обох сигналів. */
const RATING_MIN_EVENTS = 3;
const RATING_SAME_THRESHOLD = 0.8;

/**
 * Оцінювання по авторах (docs v1.3 §2.2, рядок "Аналітика по авторах: хто
 * ставить лише негатив, хто не ставить нічого, хто ставить усім однаково").
 * Докс дає три сигнали текстом, без порогових чисел — пороги (мін. 3 події,
 * 80% для "однаковості") узгоджені з користувачем окремо, не вигадані мовчки.
 *
 * "Однаковість" рахується по categoryCode (POSITIVE/NEGATIVE) або типу
 * (REPRIMAND/AWARD, у них категорії нема) — тобто це про РІЗНОМАНІТНІСТЬ
 * приводу, а не про текст коментаря.
 *
 * "Не ставить нічого" визначено через Employment.managerId (хто взагалі є
 * чиїмось керівником зараз) — свідоме спрощення: не звіряється з правом
 * RATE_POSITIVE_NEGATIVE окремо, бо managerId і так відображає реальну
 * управлінську підпорядкованість у системі.
 */
export async function getRatingAuthorAnalytics(scopePaths: string[], monthsBack: number): Promise<RatingAuthorAnalytics> {
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);

  const events = await prisma.ratingEvent.findMany({
    where: { cancelledAt: null, occurredAt: { gte: from }, type: { not: RatingType.AUTO } },
    include: { author: { include: { person: true, staffUnit: { include: { orgNode: true } } } } },
  });
  const visible = events.filter((e) => coveredByScope(scopePaths, e.author.staffUnit.orgNode.path));

  const byAuthor = new Map<number, { name: string; events: { type: RatingType; categoryCode: string | null }[] }>();
  for (const e of visible) {
    const entry = byAuthor.get(e.authorId) ?? { name: e.author.person.fullName, events: [] };
    entry.events.push({ type: e.type, categoryCode: e.categoryCode });
    byAuthor.set(e.authorId, entry);
  }

  const onlyNegative: RatingAuthorRow[] = [];
  const sameEverything: RatingAuthorRow[] = [];

  for (const [authorId, data] of byAuthor) {
    const total = data.events.length;
    if (total < RATING_MIN_EVENTS) continue;

    const positiveCount = data.events.filter((e) => RATING_POSITIVE_TYPES.has(e.type)).length;
    const negativeCount = data.events.filter((e) => RATING_NEGATIVE_TYPES.has(e.type)).length;

    const keyCounts = new Map<string, number>();
    for (const e of data.events) {
      const key = e.categoryCode ?? e.type;
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    let dominantKey: string | null = null;
    let dominantCount = 0;
    for (const [key, count] of keyCounts) {
      if (count > dominantCount) {
        dominantKey = key;
        dominantCount = count;
      }
    }
    const dominantSharePercent = Math.round((dominantCount / total) * 1000) / 10;
    const row: RatingAuthorRow = { authorId, authorName: data.name, totalEvents: total, positiveCount, negativeCount, dominantKey, dominantSharePercent };

    if (positiveCount === 0) onlyNegative.push(row);
    if (dominantSharePercent >= RATING_SAME_THRESHOLD * 100) sameEverything.push(row);
  }

  // "Не ставить нічого" — усі, хто МІГ БИ оцінювати (має RATE_POSITIVE_NEGATIVE
  // і реально бачить хоч одного іншого активного працівника в своїй області),
  // але за період не поставив жодної оцінки. Область буває SUBORDINATES (через
  // Employment.managerId — профіль "Керівництво зміною"/"Перегляд і оцінка
  // підлеглих") або по вузлу дерева OWN_OBJECT/OWN_SUBTREE ("Повне управління
  // персоналом" для адміністраторів магазину/директорів кластера) — перевіряємо
  // обидва варіанти, бо лише managerId ловить у реальних даних щонайбільше
  // одного адміністратора: managerId майже ніде не заповнений, адмін магазину
  // оцінює по OWN_OBJECT, не за прямим підпорядкуванням.
  const activeEmployments = await prisma.employment.findMany({
    where: { status: { not: EmploymentStatus.TERMINATED } },
    include: { person: true, staffUnit: { include: { orgNode: true } } },
  });
  const managerEmploymentIds = new Set(
    activeEmployments.filter((e) => e.managerId != null).map((e) => e.managerId as number),
  );

  const byPerson = new Map<number, { fullName: string; employmentIds: number[]; orgPaths: string[] }>();
  for (const e of activeEmployments) {
    const entry = byPerson.get(e.personId) ?? { fullName: e.person.fullName, employmentIds: [], orgPaths: [] };
    entry.employmentIds.push(e.id);
    entry.orgPaths.push(e.staffUnit.orgNode.path);
    byPerson.set(e.personId, entry);
  }

  const noRatings: { employmentId: number; fullName: string }[] = [];
  for (const [personId, info] of byPerson) {
    if (!info.orgPaths.some((p) => coveredByScope(scopePaths, p))) continue;

    const grants = await getEffectiveGrants(personId);
    const rateGrants = grants.filter((g) => g.capability === Capability.RATE_POSITIVE_NEGATIVE);
    if (!rateGrants.length) continue;

    const canRateViaSubordinates = rateGrants.some((g) => g.scope === "SUBORDINATES") && info.employmentIds.some((id) => managerEmploymentIds.has(id));
    const canRateViaScope = rateGrants.some(
      (g) => g.scopePath && activeEmployments.some((other) => other.personId !== personId && hasAccess(g.scopePath!, other.staffUnit.orgNode.path)),
    );
    if (!canRateViaSubordinates && !canRateViaScope) continue;

    if (!info.employmentIds.some((id) => byAuthor.has(id))) {
      noRatings.push({ employmentId: info.employmentIds[0], fullName: info.fullName });
    }
  }

  onlyNegative.sort((a, b) => b.totalEvents - a.totalEvents);
  sameEverything.sort((a, b) => b.dominantSharePercent - a.dominantSharePercent);
  noRatings.sort((a, b) => a.fullName.localeCompare(b.fullName, "uk"));

  return { months: monthsBack, onlyNegative, noRatings, sameEverything };
}

export type CuratorAnalyticsRow = {
  curatorEmploymentId: number;
  curatorName: string;
  objectName: string;
  currentlyTraining: number;
  graduatedInPeriod: number;
  hasMentorBadge: boolean;
};
export type CuratorAnalytics = { months: number; rows: CuratorAnalyticsRow[] };

/**
 * Звіт по кураторах — "хто скільки навчив/навчає" (правки 20.09.2026,
 * п.13, не покрито жодним з попередніх звітів). "Навчає зараз" — скільки
 * підопічних (Employment.curatorId) у статусі TRAINEE/READY_FOR_ATTESTATION;
 * "навчив за період" — скільки підопічних досягли ACTIVE в межах monthsBack.
 * Прямого поля дати активації нема, тому дата береться з AuditLog
 * ("onboarding.activated", той самий запис, що вже показується у вкладці
 * "Історія") — той самий підхід, що вже застосований для тривалостей
 * етапів у getHiringFunnelAnalytics.
 */
export async function getCuratorAnalytics(scopePaths: string[], monthsBack: number): Promise<CuratorAnalytics> {
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);

  const curatees = await prisma.employment.findMany({
    where: { curatorId: { not: null } },
    include: { curator: { include: { person: true, staffUnit: { include: { orgNode: true } } } } },
  });
  const visible = curatees.filter((c) => c.curator && coveredByScope(scopePaths, c.curator.staffUnit.orgNode.path));

  const graduatedLogs = await prisma.auditLog.findMany({
    where: { action: "onboarding.activated", entityType: "Employment", createdAt: { gte: from } },
    select: { entityId: true },
  });
  const graduatedIds = new Set(graduatedLogs.map((l) => l.entityId));

  const mentorAwards = await prisma.badgeAward.findMany({ where: { badgeCode: "mentor" }, select: { personId: true } });
  const mentorPersonIds = new Set(mentorAwards.map((a) => a.personId));

  const byCurator = new Map<number, CuratorAnalyticsRow>();
  for (const c of visible) {
    const curator = c.curator!;
    const row = byCurator.get(curator.id) ?? {
      curatorEmploymentId: curator.id,
      curatorName: curator.person.fullName,
      objectName: curator.staffUnit.orgNode.name,
      currentlyTraining: 0,
      graduatedInPeriod: 0,
      hasMentorBadge: mentorPersonIds.has(curator.personId),
    };
    if (c.status === EmploymentStatus.TRAINEE || c.status === EmploymentStatus.READY_FOR_ATTESTATION) row.currentlyTraining += 1;
    if (graduatedIds.has(c.id)) row.graduatedInPeriod += 1;
    byCurator.set(curator.id, row);
  }

  const rows = [...byCurator.values()].sort(
    (a, b) => b.currentlyTraining + b.graduatedInPeriod - (a.currentlyTraining + a.graduatedInPeriod) || a.curatorName.localeCompare(b.curatorName, "uk"),
  );

  return { months: monthsBack, rows };
}

export type RatingSummaryNodeRow = {
  id: number;
  name: string;
  positiveCount: number;
  negativeCount: number;
  reprimandCount: number;
  awardCount: number;
  netScore: number;
};
export type RatingSummaryPersonRow = {
  personId: number;
  fullName: string;
  locationName: string;
  positiveCount: number;
  negativeCount: number;
  reprimandCount: number;
  awardCount: number;
  netScore: number;
};
export type RatingSummaryAnalytics = {
  months: number;
  byObject: RatingSummaryNodeRow[];
  byCluster: RatingSummaryNodeRow[];
  topPositive: RatingSummaryPersonRow[];
  topNegative: RatingSummaryPersonRow[];
};

const RATING_SUMMARY_TOP_N = 10;

/**
 * Підсумки рейтингу/нагород по об'єктах і кластерах + топ працівників за
 * сумою балів (правки 20.09.2026, п.13). Лише для керівництва — той самий
 * гейт VIEW_ANALYTICS, що й решта звітів; архітектурне рішення №8 з
 * CLAUDE.md ("працівник не бачить свій бал") про видимість САМОМУ
 * працівнику, цей звіт йому недоступний узагалі.
 *
 * "По об'єктах"/"по кластерах" — за тим самим спрощенням, що вже в
 * getStaffingAnalytics/getTurnoverAnalytics: рахуються тільки вузли типу
 * OBJECT/DIVISION (адміністративні відділи без такого предка — поза цими
 * двома розбивками, але й далі в топ-списках працівників).
 */
export async function getRatingSummaryAnalytics(scopePaths: string[], monthsBack: number): Promise<RatingSummaryAnalytics> {
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);

  const events = await prisma.ratingEvent.findMany({
    where: { cancelledAt: null, occurredAt: { gte: from }, type: { not: RatingType.AUTO } },
  });
  if (!events.length) return { months: monthsBack, byObject: [], byCluster: [], topPositive: [], topNegative: [] };

  // НЕ фільтруємо за статусом — подія рейтингу лишається прив'язаною до
  // місця, де вона сталась, навіть якщо людину відтоді звільнено (інакше
  // саме найпоказовіші негативні події зникали б із звіту про об'єкт).
  // Активне Employment пріоритетне (id за спаданням — найновіше), якщо
  // такого нема — останнє з наявних.
  const personIds = [...new Set(events.map((e) => e.personId))];
  const employments = await prisma.employment.findMany({
    where: { personId: { in: personIds } },
    include: { staffUnit: { include: { orgNode: true } }, person: true },
    orderBy: { id: "desc" },
  });
  const employmentByPerson = new Map<number, (typeof employments)[number]>();
  for (const e of employments) {
    const existing = employmentByPerson.get(e.personId);
    if (!existing || (existing.status === EmploymentStatus.TERMINATED && e.status !== EmploymentStatus.TERMINATED)) {
      employmentByPerson.set(e.personId, e);
    }
  }

  const allNodes = await prisma.orgNode.findMany({ select: { id: true, type: true, path: true, name: true } });
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const findAncestor = (path: string, type: OrgNodeType) => {
    const ids = path.split(".").map(Number);
    for (let i = ids.length - 1; i >= 0; i--) {
      const candidate = nodeById.get(ids[i]);
      if (candidate?.type === type) return candidate;
    }
    return null;
  };

  const byObject = new Map<number, RatingSummaryNodeRow>();
  const byCluster = new Map<number, RatingSummaryNodeRow>();
  const byPerson = new Map<number, RatingSummaryPersonRow>();

  const bump = (
    row: { positiveCount: number; negativeCount: number; reprimandCount: number; awardCount: number; netScore: number },
    type: RatingType,
    points: number,
  ) => {
    if (type === RatingType.POSITIVE) row.positiveCount += 1;
    else if (type === RatingType.NEGATIVE) row.negativeCount += 1;
    else if (type === RatingType.REPRIMAND) row.reprimandCount += 1;
    else if (type === RatingType.AWARD) row.awardCount += 1;
    row.netScore += points;
  };

  for (const e of events) {
    const employment = employmentByPerson.get(e.personId);
    if (!employment) continue; // звільнені за період — без поточного місця, поза розбивкою
    const nodePath = employment.staffUnit.orgNode.path;
    if (!coveredByScope(scopePaths, nodePath)) continue;

    const objectNode = findAncestor(nodePath, OrgNodeType.OBJECT);
    if (objectNode) {
      const row = byObject.get(objectNode.id) ?? {
        id: objectNode.id,
        name: objectNode.name,
        positiveCount: 0,
        negativeCount: 0,
        reprimandCount: 0,
        awardCount: 0,
        netScore: 0,
      };
      bump(row, e.type, e.points);
      byObject.set(objectNode.id, row);
    }

    const clusterNode = findAncestor(nodePath, OrgNodeType.DIVISION);
    if (clusterNode) {
      const row = byCluster.get(clusterNode.id) ?? {
        id: clusterNode.id,
        name: clusterNode.name,
        positiveCount: 0,
        negativeCount: 0,
        reprimandCount: 0,
        awardCount: 0,
        netScore: 0,
      };
      bump(row, e.type, e.points);
      byCluster.set(clusterNode.id, row);
    }

    const personRow = byPerson.get(e.personId) ?? {
      personId: e.personId,
      fullName: employment.person.fullName,
      locationName: objectNode?.name ?? employment.staffUnit.orgNode.name,
      positiveCount: 0,
      negativeCount: 0,
      reprimandCount: 0,
      awardCount: 0,
      netScore: 0,
    };
    bump(personRow, e.type, e.points);
    byPerson.set(e.personId, personRow);
  }

  const byObjectRows = [...byObject.values()].sort((a, b) => a.name.localeCompare(b.name, "uk"));
  const byClusterRows = [...byCluster.values()].sort((a, b) => a.name.localeCompare(b.name, "uk"));
  const allPersons = [...byPerson.values()];
  const topPositive = [...allPersons].sort((a, b) => b.netScore - a.netScore).slice(0, RATING_SUMMARY_TOP_N);
  const topNegative = [...allPersons].sort((a, b) => a.netScore - b.netScore).slice(0, RATING_SUMMARY_TOP_N);

  return { months: monthsBack, byObject: byObjectRows, byCluster: byClusterRows, topPositive, topNegative };
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

export type InspectionStatsStoreRow = {
  objectId: number;
  objectName: string;
  inspections: number;
  postponed: number;
  green: number;
  yellow: number;
  red: number;
  greenPercent: number;
  openViolations: number;
};
export type InspectionStatsBucket = { label: string; green: number; yellow: number; red: number; total: number; redPercent: number };
export type InspectionStatsRequirement = { text: string; where: string; red: number; total: number };
export type InspectionAnalytics = {
  months: number;
  completed: number;
  green: number;
  yellow: number;
  red: number;
  violationsOpen: number;
  violationsInProgress: number;
  violationsResolved: number;
  avgResolveHours: number | null;
  byStore: InspectionStatsStoreRow[];
  byArea: InspectionStatsBucket[];
  topRequirements: InspectionStatsRequirement[];
};

/**
 * Статистика обходів (етап 9): прості лічильники 🟢/🟡/🔴 — без KPI-формули
 * (її свідомо відкладено) і без розрізу по окремих працівниках: індивідуальні
 * оцінки видно лише в рейтингу керівникам, тут вони лише входять у загальні суми.
 */
export async function getInspectionAnalytics(scopePaths: string[], monthsBack: number): Promise<InspectionAnalytics> {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);

  const stores = (await prisma.orgNode.findMany({ where: { type: OrgNodeType.OBJECT, isActive: true } })).filter((o) => coveredByScope(scopePaths, o.path));
  const storeIds = stores.map((s) => s.id);

  const inspections = await prisma.inspection.findMany({
    where: { orgNodeId: { in: storeIds }, status: "COMPLETED", completedAt: { gte: since } },
    include: { results: { include: { item: true, area: { include: { areaType: true } } } } },
  });
  const postponedAll = await prisma.inspection.findMany({ where: { orgNodeId: { in: storeIds }, postponedCount: { gt: 0 }, plannedFor: { gte: since } }, select: { orgNodeId: true, postponedCount: true } });
  const violations = await prisma.violation.findMany({ where: { orgNodeId: { in: storeIds }, OR: [{ createdAt: { gte: since } }, { status: { not: "RESOLVED" } }] } });

  const storeRows = new Map<number, InspectionStatsStoreRow>(
    stores.map((s) => [s.id, { objectId: s.id, objectName: s.name, inspections: 0, postponed: 0, green: 0, yellow: 0, red: 0, greenPercent: 0, openViolations: 0 }]),
  );
  const areaBuckets = new Map<string, InspectionStatsBucket>();
  const reqMap = new Map<string, InspectionStatsRequirement>();
  const bump = (b: { green: number; yellow: number; red: number }, rating: string) => {
    if (rating === "GREEN") b.green += 1;
    else if (rating === "YELLOW") b.yellow += 1;
    else b.red += 1;
  };

  let green = 0;
  let yellow = 0;
  let red = 0;
  for (const insp of inspections) {
    const row = storeRows.get(insp.orgNodeId)!;
    row.inspections += 1;
    for (const r of insp.results) {
      bump(row, r.rating);
      if (r.rating === "GREEN") green += 1;
      else if (r.rating === "YELLOW") yellow += 1;
      else red += 1;

      const label = r.item.target === "AREA" ? (r.area?.areaType.name ?? "Ділянка") : r.item.target === "PERSON" ? "Працівники (разом)" : "Загальний стан";
      const bucket = areaBuckets.get(label) ?? { label, green: 0, yellow: 0, red: 0, total: 0, redPercent: 0 };
      bump(bucket, r.rating);
      bucket.total += 1;
      areaBuckets.set(label, bucket);

      const reqKey = `${r.item.id}`;
      const req = reqMap.get(reqKey) ?? { text: r.item.text, where: label, red: 0, total: 0 };
      req.total += 1;
      if (r.rating === "RED") req.red += 1;
      reqMap.set(reqKey, req);
    }
  }
  for (const p of postponedAll) {
    const row = storeRows.get(p.orgNodeId);
    if (row) row.postponed += p.postponedCount;
  }

  let open = 0;
  let inProgress = 0;
  let resolved = 0;
  const resolveHours: number[] = [];
  for (const v of violations) {
    if (v.status === "OPEN") {
      open += 1;
      storeRows.get(v.orgNodeId)!.openViolations += 1;
    } else if (v.status === "IN_PROGRESS") {
      inProgress += 1;
      storeRows.get(v.orgNodeId)!.openViolations += 1;
    } else if (v.resolvedAt && v.resolvedAt >= since) {
      resolved += 1;
      resolveHours.push((v.resolvedAt.getTime() - v.createdAt.getTime()) / 3_600_000);
    }
  }

  const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
  const byStore = [...storeRows.values()].filter((r) => r.inspections > 0 || r.openViolations > 0 || r.postponed > 0);
  for (const r of byStore) r.greenPercent = pct(r.green, r.green + r.yellow + r.red);
  const byArea = [...areaBuckets.values()].map((b) => ({ ...b, redPercent: pct(b.red, b.total) })).sort((a, b) => b.redPercent - a.redPercent);

  return {
    months: monthsBack,
    completed: inspections.length,
    green,
    yellow,
    red,
    violationsOpen: open,
    violationsInProgress: inProgress,
    violationsResolved: resolved,
    avgResolveHours: resolveHours.length ? Math.round((resolveHours.reduce((a, b) => a + b, 0) / resolveHours.length) * 10) / 10 : null,
    byStore: byStore.sort((a, b) => a.greenPercent - b.greenPercent),
    byArea,
    topRequirements: [...reqMap.values()].filter((r) => r.red > 0).sort((a, b) => b.red - a.red).slice(0, 8),
  };
}
