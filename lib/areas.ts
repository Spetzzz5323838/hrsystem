import { prisma } from "./prisma";
import { resolveAssignee } from "./onboarding";
import { sendNotification } from "./notificationTemplates";
import { Role, EmploymentStatus } from "../generated/prisma/client";

/** Через стільки хвилин після відкриття магазину перевіряємо, чи є хтось на ділянках (рішення 2026-10-18). */
export const STAFFING_CHECK_DELAY_MIN = 30;
/** Якщо бот був вимкнений, перевірку ще можна зробити пізніше, але не довше за це вікно. */
const STAFFING_CHECK_WINDOW_MIN = 180;

/** "08:30" → хвилини від початку доби; null, якщо формат невірний. */
export function parseOpenTime(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Працівники магазину, яких можна призначити відповідальними (не звільнені). */
export async function listStoreCandidates(orgNodeId: number) {
  const employments = await prisma.employment.findMany({
    where: { status: { not: EmploymentStatus.TERMINATED }, staffUnit: { orgNodeId } },
    include: { person: true, staffUnit: { include: { positionProfile: true } } },
    orderBy: { person: { fullName: "asc" } },
  });
  return employments.map((e) => ({ employmentId: e.id, fullName: e.person.fullName, positionTitle: e.staffUnit.positionProfile.title }));
}

/**
 * Перевірка "ділянка без персоналу" (бот, кожні 10 хв). Для магазину з
 * заданим часом відкриття, раз на добу, через 30 хв після відкриття: ділянки
 * типів із requiresStaff, де немає жодного відповідального на відкритій зміні
 * (або взагалі немає відповідальних) — одне зведене повідомлення адміну.
 */
export async function checkUnstaffedAreas(now: Date = new Date()): Promise<{ alerted: number }> {
  const stores = await prisma.orgNode.findMany({ where: { isActive: true, openTime: { not: null } } });
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let alerted = 0;
  for (const store of stores) {
    const open = parseOpenTime(store.openTime ?? "");
    if (open === null) continue;
    const dueAt = open + STAFFING_CHECK_DELAY_MIN;
    if (nowMinutes < dueAt || nowMinutes >= dueAt + STAFFING_CHECK_WINDOW_MIN) continue;
    if (store.staffingCheckedOn && store.staffingCheckedOn.getTime() === today.getTime()) continue;

    await prisma.orgNode.update({ where: { id: store.id }, data: { staffingCheckedOn: today } });

    const areas = await prisma.area.findMany({
      where: { orgNodeId: store.id, isActive: true, areaType: { requiresStaff: true, isActive: true } },
      include: { areaType: true, responsibles: { where: { employment: { status: { not: EmploymentStatus.TERMINATED } } } } },
      orderBy: { areaType: { sortOrder: "asc" } },
    });
    if (!areas.length) continue;

    const onShift = new Set(
      (await prisma.workShift.findMany({ where: { orgNodeId: store.id, endedAt: null }, select: { employmentId: true } })).map((s) => s.employmentId),
    );
    const lines: string[] = [];
    for (const a of areas) {
      if (!a.responsibles.length) lines.push(`• ${a.areaType.name} — не призначено відповідальних`);
      else if (!a.responsibles.some((r) => onShift.has(r.employmentId))) lines.push(`• ${a.areaType.name} — ніхто з відповідальних не відмітився`);
    }
    if (!lines.length) continue;

    const adminEmploymentId = await resolveAssignee(Role.STORE_ADMIN, store.path);
    const admin = adminEmploymentId ? await prisma.employment.findUnique({ where: { id: adminEmploymentId } }) : null;
    if (!admin) continue;
    await sendNotification(admin.personId, "area.unstaffed", {
      storeName: store.name,
      openTime: store.openTime ?? "",
      list: lines.join("\n"),
    });
    alerted += 1;
  }
  return { alerted };
}
