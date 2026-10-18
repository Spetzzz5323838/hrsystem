import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { resolveAssignee } from "./onboarding";
import { sendNotification } from "./notificationTemplates";
import { parseOpenTime } from "./areas";
import { EmploymentStatus, InspectionKind, InspectionStatus, OrgNodeType, RegulationTarget, Role } from "../generated/prisma/client";

/* ───────────────────────── Регламент (версії) ───────────────────────── */

export type RegulationItemInput = {
  text: string;
  target: RegulationTarget;
  areaTypeId: number | null;
  positionProfileId: number | null;
  inDaily: boolean;
};

/** Поточна версія регламенту з вимогами (або null, якщо його ще не створено). */
export async function getCurrentRegulation() {
  return prisma.regulationVersion.findFirst({
    where: { isCurrent: true },
    include: { createdBy: { include: { person: true } }, items: { orderBy: { sortOrder: "asc" } } },
  });
}

/** Перевірка й нормалізація списку вимог з форми. */
export async function normalizeItems(raw: unknown): Promise<{ ok: true; items: RegulationItemInput[] } | { ok: false; error: string }> {
  if (!Array.isArray(raw) || !raw.length) return { ok: false, error: "У регламенті має бути хоча б одна вимога" };
  if (raw.length > 300) return { ok: false, error: "Забагато вимог (максимум 300)" };

  const [areaTypes, positions] = await Promise.all([
    prisma.areaType.findMany({ select: { id: true } }),
    prisma.positionProfile.findMany({ select: { id: true } }),
  ]);
  const areaTypeIds = new Set(areaTypes.map((t) => t.id));
  const positionIds = new Set(positions.map((p) => p.id));

  const items: RegulationItemInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as Record<string, unknown> | null;
    const text = typeof r?.text === "string" ? r.text.trim() : "";
    if (!text) return { ok: false, error: `Вимога ${i + 1}: порожній текст` };
    if (text.length > 300) return { ok: false, error: `Вимога ${i + 1}: текст довший за 300 символів` };
    const target = r?.target as RegulationTarget;
    if (target !== RegulationTarget.GENERAL && target !== RegulationTarget.AREA && target !== RegulationTarget.PERSON) {
      return { ok: false, error: `Вимога ${i + 1}: невідомий об'єкт оцінювання` };
    }
    let areaTypeId: number | null = null;
    let positionProfileId: number | null = null;
    if (target === RegulationTarget.AREA) {
      areaTypeId = Number(r?.areaTypeId);
      if (!areaTypeIds.has(areaTypeId)) return { ok: false, error: `Вимога ${i + 1}: оберіть тип ділянки` };
    }
    if (target === RegulationTarget.PERSON) {
      positionProfileId = Number(r?.positionProfileId);
      if (!positionIds.has(positionProfileId)) return { ok: false, error: `Вимога ${i + 1}: оберіть посаду` };
    }
    items.push({ text, target, areaTypeId, positionProfileId, inDaily: r?.inDaily === true });
  }
  return { ok: true, items };
}

const sameItems = (a: RegulationItemInput[], b: RegulationItemInput[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Зберігає регламент як НОВУ версію (стара лишається в історії; обходи, які вже
 * йдуть за старою, не ламаються). Якщо вимоги не змінилися — нічого не робить.
 */
export async function saveRegulation(
  items: RegulationItemInput[],
  note: string | null,
  actorEmploymentId: number | null,
): Promise<{ ok: true; version: number; unchanged: boolean }> {
  const current = await getCurrentRegulation();
  if (current) {
    const currentItems: RegulationItemInput[] = current.items.map((i) => ({
      text: i.text,
      target: i.target,
      areaTypeId: i.areaTypeId,
      positionProfileId: i.positionProfileId,
      inDaily: i.inDaily,
    }));
    if (sameItems(currentItems, items)) return { ok: true, version: current.version, unchanged: true };
  }

  const last = await prisma.regulationVersion.findFirst({ orderBy: { version: "desc" } });
  const version = (last?.version ?? 0) + 1;
  await prisma.$transaction([
    prisma.regulationVersion.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } }),
    prisma.regulationVersion.create({
      data: {
        version,
        isCurrent: true,
        note: note?.trim() || null,
        createdById: actorEmploymentId,
        items: { create: items.map((it, idx) => ({ ...it, sortOrder: idx + 1 })) },
      },
    }),
  ]);
  await logAudit({ actorId: actorEmploymentId, action: "regulation.versionCreated", entityType: "RegulationVersion", entityId: version, diff: { items: items.length, note } });
  return { ok: true, version, unchanged: false };
}

/* ───────────────────────── Розклад і планування ───────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;

function atTime(day: Date, minutes: number): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Найближчий майбутній момент за розкладом: щодня о HH:MM (weeklyDay=null) або у вказаний день тижня (1=пн…7=нд). */
export function nextOccurrence(from: Date, timeMin: number, weeklyDay: number | null): Date {
  for (let i = 0; i <= 7; i++) {
    const day = new Date(startOfDay(from).getTime() + i * DAY_MS);
    const candidate = atTime(day, timeMin);
    const dow = candidate.getDay() === 0 ? 7 : candidate.getDay();
    if (candidate.getTime() > from.getTime() && (weeklyDay === null || dow === weeklyDay)) return candidate;
  }
  return atTime(new Date(from.getTime() + DAY_MS), timeMin);
}

export type ScheduleInput = { dailyTime: string | null; weeklyDay: number | null; weeklyTime: string | null };

export function validateSchedule(input: { dailyTime?: unknown; weeklyDay?: unknown; weeklyTime?: unknown }): { ok: true; value: ScheduleInput } | { ok: false; error: string } {
  const dailyTime = typeof input.dailyTime === "string" && input.dailyTime.trim() ? input.dailyTime.trim() : null;
  const weeklyTime = typeof input.weeklyTime === "string" && input.weeklyTime.trim() ? input.weeklyTime.trim() : null;
  const weeklyDay = input.weeklyDay === null || input.weeklyDay === undefined || input.weeklyDay === "" ? null : Number(input.weeklyDay);
  if (dailyTime && parseOpenTime(dailyTime) === null) return { ok: false, error: "Час щоденного обходу має вигляд ГГ:ХХ" };
  if (weeklyTime && parseOpenTime(weeklyTime) === null) return { ok: false, error: "Час щотижневого обходу має вигляд ГГ:ХХ" };
  if (weeklyDay !== null && !(Number.isInteger(weeklyDay) && weeklyDay >= 1 && weeklyDay <= 7)) return { ok: false, error: "Невірний день тижня" };
  if (Boolean(weeklyTime) !== (weeklyDay !== null)) return { ok: false, error: "Для щотижневого обходу потрібні і день, і час" };
  return { ok: true, value: { dailyTime, weeklyDay, weeklyTime } };
}

/**
 * Зберігає розклад магазину. Заплановані, але не розпочаті обходи скасовуються
 * й одразу створюються заново за новим розкладом (обхід, що вже йде, не чіпаємо).
 */
export async function saveSchedule(orgNodeId: number, value: ScheduleInput, actorEmploymentId: number | null): Promise<void> {
  await prisma.inspectionSchedule.upsert({
    where: { orgNodeId },
    create: { orgNodeId, ...value, updatedById: actorEmploymentId },
    update: { ...value, updatedById: actorEmploymentId },
  });
  await prisma.inspection.updateMany({ where: { orgNodeId, status: InspectionStatus.PLANNED }, data: { status: InspectionStatus.CANCELLED } });
  await ensurePlanned(orgNodeId, new Date());
  await logAudit({ actorId: actorEmploymentId, action: "inspectionSchedule.changed", entityType: "OrgNode", entityId: orgNodeId, diff: value });
}

/** Для кожного виду обходу в розкладі має існувати один відкритий (запланований чи той, що йде). */
export async function ensurePlanned(orgNodeId: number, now: Date): Promise<number> {
  const schedule = await prisma.inspectionSchedule.findUnique({ where: { orgNodeId } });
  if (!schedule) return 0;
  const open = await prisma.inspection.findMany({ where: { orgNodeId, status: { in: [InspectionStatus.PLANNED, InspectionStatus.IN_PROGRESS] } } });

  let created = 0;
  const wanted: { kind: InspectionKind; at: Date }[] = [];
  const daily = schedule.dailyTime ? parseOpenTime(schedule.dailyTime) : null;
  if (daily !== null) wanted.push({ kind: InspectionKind.DAILY, at: nextOccurrence(now, daily, null) });
  const weekly = schedule.weeklyTime ? parseOpenTime(schedule.weeklyTime) : null;
  if (weekly !== null && schedule.weeklyDay) wanted.push({ kind: InspectionKind.WEEKLY, at: nextOccurrence(now, weekly, schedule.weeklyDay) });

  for (const w of wanted) {
    if (open.some((o) => o.kind === w.kind)) continue;
    await prisma.inspection.create({ data: { orgNodeId, kind: w.kind, plannedFor: w.at, originalPlannedFor: w.at } });
    created += 1;
  }
  return created;
}

/** Кому повідомляти про пропущений обхід: адмін магазину, директор кластера (голова підрозділу над магазином), COO. */
export async function leadershipRecipients(storePath: string): Promise<number[]> {
  const personIds = new Set<number>();
  const add = async (employmentId: number | null | undefined) => {
    if (!employmentId) return;
    const e = await prisma.employment.findUnique({ where: { id: employmentId } });
    if (e && e.status !== EmploymentStatus.TERMINATED) personIds.add(e.personId);
  };
  await add(await resolveAssignee(Role.STORE_ADMIN, storePath));
  await add(await resolveAssignee(Role.COO, storePath));
  const ancestorIds = storePath.split(".").map(Number).filter(Number.isInteger);
  const heads = await prisma.orgNode.findMany({ where: { id: { in: ancestorIds }, type: OrgNodeType.DIVISION, headEmploymentId: { not: null } } });
  for (const h of heads) await add(h.headEmploymentId);
  return [...personIds];
}

const fmtDate = (d: Date) => d.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const KIND_LABEL: Record<InspectionKind, string> = { DAILY: "щоденний", WEEKLY: "щотижневий" };

/**
 * Щоденний тик (бот, кожні 10 хв): (1) обхід, запланований на день, що вже минув,
 * і не розпочатий — переноситься на наступний день той самий час, керівникам іде
 * повідомлення; (2) для магазинів із розкладом створюються відсутні обходи.
 */
export async function tickInspections(now: Date = new Date()): Promise<{ postponed: number; created: number }> {
  const todayStart = startOfDay(now);
  const overdue = await prisma.inspection.findMany({
    where: { status: InspectionStatus.PLANNED, plannedFor: { lt: todayStart } },
    include: { orgNode: true },
  });

  let postponed = 0;
  for (const insp of overdue) {
    let next = new Date(insp.plannedFor.getTime() + DAY_MS);
    while (next.getTime() < todayStart.getTime()) next = new Date(next.getTime() + DAY_MS);
    await prisma.inspection.update({ where: { id: insp.id }, data: { plannedFor: next, postponedCount: { increment: 1 } } });
    for (const personId of await leadershipRecipients(insp.orgNode.path)) {
      await sendNotification(personId, "inspection.postponed", {
        storeName: insp.orgNode.name,
        kind: KIND_LABEL[insp.kind],
        was: fmtDate(insp.plannedFor),
        next: fmtDate(next),
      });
    }
    await logAudit({ actorId: null, action: "inspection.postponed", entityType: "Inspection", entityId: insp.id, diff: { from: insp.plannedFor.toISOString(), to: next.toISOString() } });
    postponed += 1;
  }

  let created = 0;
  const schedules = await prisma.inspectionSchedule.findMany({ select: { orgNodeId: true } });
  for (const s of schedules) created += await ensurePlanned(s.orgNodeId, now);
  return { postponed, created };
}
