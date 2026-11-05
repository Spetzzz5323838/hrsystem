import { prisma } from "./prisma";
import { sendNotification } from "./notificationTemplates";
import { hasAccess } from "./access";
import { EmploymentStatus, Role } from "../generated/prisma/client";

/**
 * Центр сповіщень (2026-11-05). Подія записується в EventLog у момент, коли щось сталося,
 * а розсилається вона раз на добу одним зведенням (jobs у bot/index.ts).
 * Кому приходить — рахується в момент розсилки: правило за замовчуванням
 * (EventRule: мінімальний рівень посади + бухгалтери) і особисті підписки
 * (EventSubscription) поверх нього. Потрібне й покриття: подію бачить лише той,
 * чия область (вузол дерева) містить вузол події.
 */

export type EventDef = {
  code: string;
  title: string;
  description: string;
  /** Групи для екрана: працівники / обходи. */
  group: "EMPLOYEES" | "INSPECTIONS";
  /** Чи зміст події — кадровий (бухгалтеру за замовчуванням цікаво, якщо увімкнено в правилі). */
  hr: boolean;
};

export const EVENT_CATALOG: EventDef[] = [
  { code: "HIRE_REGISTERED", title: "Новий працівник зареєструвався", description: "Людина пройшла реєстрацію за QR-кодом і чекає на опрацювання.", group: "EMPLOYEES", hr: true },
  { code: "HIRE_TRAINEE", title: "Працівника прийнято на стажування", description: "Документи опрацьовано, стажування розпочато.", group: "EMPLOYEES", hr: true },
  { code: "HIRE_ACTIVE", title: "Стажер пройшов атестацію", description: "Стажер став повноцінним працівником.", group: "EMPLOYEES", hr: true },
  { code: "TERMINATION_STARTED", title: "Розпочато звільнення", description: "Запущено процес звільнення працівника.", group: "EMPLOYEES", hr: true },
  { code: "TERMINATION_DONE", title: "Звільнення завершено", description: "Усі пункти звільнення виконано, працівника звільнено.", group: "EMPLOYEES", hr: true },
  { code: "TRANSFER", title: "Переведення працівника", description: "Розпочато або завершено переведення на іншу посаду чи об'єкт.", group: "EMPLOYEES", hr: false },
  { code: "FREEZE", title: "Заморозка / повернення", description: "Працівника заморожено (декрет, мобілізація, лікування) або він повернувся.", group: "EMPLOYEES", hr: false },
  { code: "INSPECTION_COMPLETED", title: "Завершено обхід магазину", description: "Підсумок обходу: скільки 🟢/🟡/🔴 і загальний висновок.", group: "INSPECTIONS", hr: false },
];

const CATALOG_BY_CODE = new Map(EVENT_CATALOG.map((e) => [e.code, e]));

/** Мінімальний рівень посади, з якого людина взагалі може підписатися сама (адмін магазину = 30). */
const MIN_SUBSCRIBE_LEVEL = 30;

/** Записує подію. Ніколи не кидає помилку нагору — сповіщення не повинні ламати основну дію. */
export async function recordEvent(eventCode: string, orgNodeId: number, text: string): Promise<void> {
  try {
    if (!CATALOG_BY_CODE.has(eventCode)) return;
    await prisma.eventLog.create({ data: { eventCode, orgNodeId, text } });
  } catch (e) {
    console.error("recordEvent:", e);
  }
}

type Candidate = { personId: number; level: number; isAccountant: boolean; coversAll: boolean; paths: string[] };

/** Усі люди з Telegram і чинним працевлаштуванням, що потенційно можуть отримувати події. */
async function loadCandidates(): Promise<Candidate[]> {
  const employments = await prisma.employment.findMany({
    where: { status: { notIn: [EmploymentStatus.TERMINATED] }, person: { telegramId: { not: null } } },
    include: { staffUnit: { include: { orgNode: true, positionProfile: true } }, roleAssignments: { include: { orgNode: true } } },
  });
  const byPerson = new Map<number, Candidate>();
  for (const e of employments) {
    let c = byPerson.get(e.personId);
    if (!c) {
      c = { personId: e.personId, level: 0, isAccountant: false, coversAll: false, paths: [] };
      byPerson.set(e.personId, c);
    }
    c.level = Math.max(c.level, e.staffUnit.positionProfile.level);
    c.paths.push(e.staffUnit.orgNode.path);
    if (e.staffUnit.positionProfile.systemRole === Role.ACCOUNTANT) c.isAccountant = true;
    for (const ra of e.roleAssignments) {
      c.paths.push(ra.orgNode.path);
      if (ra.role === Role.ACCOUNTANT) c.isAccountant = true;
    }
  }
  return [...byPerson.values()];
}

/** Чи покриває область кандидата вузол події. Бухгалтери бачать кадрові події всієї компанії. */
function covers(c: Candidate, nodePath: string, hr: boolean): boolean {
  if (c.isAccountant && hr) return true;
  return c.paths.some((p) => hasAccess(p, nodePath));
}

export type RuleView = { eventCode: string; enabled: boolean; minLevel: number; includeAccountants: boolean };

async function loadRules(): Promise<Map<string, RuleView>> {
  const rules = await prisma.eventRule.findMany();
  const map = new Map(rules.map((r) => [r.eventCode, r]));
  for (const def of EVENT_CATALOG) {
    if (!map.has(def.code)) map.set(def.code, { eventCode: def.code, enabled: true, minLevel: 40, includeAccountants: false });
  }
  return map;
}

/** Чи отримує людина подію: особиста підписка має пріоритет над правилом за замовчуванням. */
function wants(c: Candidate, def: EventDef, rule: RuleView, personal: boolean | undefined): boolean {
  if (personal !== undefined) return personal;
  if (!rule.enabled) return false;
  if (c.level >= rule.minLevel) return true;
  return rule.includeAccountants && def.hr && c.isAccountant;
}

type PendingEvent = { id: number; eventCode: string; createdAt: Date; text: string; orgNode: { path: string } };

/** Хто що отримає: personId → рядки зведення. Окремо від відправлення, щоб можна було перевірити без Telegram. */
export async function planDigest(events: PendingEvent[]): Promise<Map<number, string[]>> {
  const plan = new Map<number, string[]>();
  if (!events.length) return plan;
  const [candidates, rules, subs] = await Promise.all([loadCandidates(), loadRules(), prisma.eventSubscription.findMany()]);
  const subMap = new Map(subs.map((s) => [`${s.personId}:${s.eventCode}`, s.enabled]));

  for (const c of candidates) {
    const mine = events.filter((ev) => {
      const def = CATALOG_BY_CODE.get(ev.eventCode);
      const rule = rules.get(ev.eventCode);
      if (!def || !rule) return false;
      if (!covers(c, ev.orgNode.path, def.hr)) return false;
      return wants(c, def, rule, subMap.get(`${c.personId}:${ev.eventCode}`));
    });
    if (!mine.length) continue;

    // Ліміт Telegram — 4096 символів; тримаємо запас під шаблон.
    const lines: string[] = [];
    let used = 0;
    let skipped = 0;
    for (const ev of mine) {
      const line = `• ${ev.createdAt.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })} — ${ev.text}`;
      if (used + line.length > 3500) {
        skipped++;
        continue;
      }
      used += line.length + 1;
      lines.push(line);
    }
    if (skipped) lines.push(`…і ще ${skipped} подій (повний перелік — у вебі, розділ «Сповіщення»).`);
    plan.set(c.personId, lines);
  }
  return plan;
}

/** Розсилає одне зведення кожному, кому є що показати. Викликається щодня з бота. */
export async function dispatchDigest(): Promise<{ events: number; recipients: number }> {
  const events = await prisma.eventLog.findMany({ where: { dispatchedAt: null }, include: { orgNode: true }, orderBy: { id: "asc" } });
  if (!events.length) return { events: 0, recipients: 0 };

  const plan = await planDigest(events);
  let recipients = 0;
  for (const [personId, lines] of plan) {
    try {
      await sendNotification(personId, "events.digest", { lines: lines.join("\n") });
      recipients++;
    } catch (e) {
      console.error("dispatchDigest:", personId, e);
    }
  }

  await prisma.eventLog.updateMany({ where: { id: { in: events.map((e) => e.id) } }, data: { dispatchedAt: new Date() } });
  return { events: events.length, recipients };
}

export type SubscriptionRow = { eventCode: string; title: string; description: string; enabled: boolean; isPersonal: boolean };

/** Події, на які людина може підписатися, і її поточний стан. null — підписки недоступні (рівень нижче 30 і не бухгалтер). */
export async function getMySubscriptions(personId: number): Promise<SubscriptionRow[] | null> {
  const candidates = await loadCandidates();
  const me = candidates.find((c) => c.personId === personId);
  if (!me || (me.level < MIN_SUBSCRIBE_LEVEL && !me.isAccountant)) return null;
  const [rules, subs] = await Promise.all([loadRules(), prisma.eventSubscription.findMany({ where: { personId } })]);
  const subMap = new Map(subs.map((s) => [s.eventCode, s.enabled]));
  return EVENT_CATALOG.map((def) => {
    const personal = subMap.get(def.code);
    return {
      eventCode: def.code,
      title: def.title,
      description: def.description,
      enabled: wants(me, def, rules.get(def.code)!, personal),
      isPersonal: personal !== undefined,
    };
  });
}

/** Перемикає підписку: зберігає особисте перевизначення. */
export async function toggleSubscription(personId: number, eventCode: string): Promise<boolean | null> {
  if (!CATALOG_BY_CODE.has(eventCode)) return null;
  const rows = await getMySubscriptions(personId);
  if (!rows) return null;
  const current = rows.find((r) => r.eventCode === eventCode)!.enabled;
  await prisma.eventSubscription.upsert({
    where: { personId_eventCode: { personId, eventCode } },
    create: { personId, eventCode, enabled: !current },
    update: { enabled: !current },
  });
  return !current;
}

export async function getEventRules(): Promise<(RuleView & { title: string; description: string })[]> {
  const rules = await loadRules();
  return EVENT_CATALOG.map((d) => ({ ...rules.get(d.code)!, title: d.title, description: d.description }));
}

export async function saveEventRule(eventCode: string, data: { enabled: boolean; minLevel: number; includeAccountants: boolean }): Promise<boolean> {
  if (!CATALOG_BY_CODE.has(eventCode)) return false;
  await prisma.eventRule.upsert({ where: { eventCode }, create: { eventCode, ...data }, update: data });
  return true;
}

export async function getRecentEvents(limit = 100) {
  const rows = await prisma.eventLog.findMany({ orderBy: { id: "desc" }, take: limit, include: { orgNode: true } });
  return rows.map((r) => ({
    id: r.id,
    eventCode: r.eventCode,
    title: CATALOG_BY_CODE.get(r.eventCode)?.title ?? r.eventCode,
    node: r.orgNode.name,
    text: r.text,
    createdAt: r.createdAt.toISOString(),
    dispatchedAt: r.dispatchedAt?.toISOString() ?? null,
  }));
}

/**
 * Зручна обгортка для подій про працівника: сама підставляє ПІБ, посаду й об'єкт.
 * `suffix` — що саме сталося («розпочато звільнення» тощо).
 */
export async function recordEmploymentEvent(eventCode: string, employmentId: number, suffix: string): Promise<void> {
  try {
    const e = await prisma.employment.findUnique({
      where: { id: employmentId },
      include: { person: true, staffUnit: { include: { orgNode: true, positionProfile: true } } },
    });
    if (!e) return;
    await recordEvent(eventCode, e.staffUnit.orgNodeId, `${e.person.fullName} (${e.staffUnit.positionProfile.title}, ${e.staffUnit.orgNode.name}) — ${suffix}`);
  } catch (err) {
    console.error("recordEmploymentEvent:", err);
  }
}
