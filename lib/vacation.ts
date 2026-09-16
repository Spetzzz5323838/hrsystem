import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { getEffectiveGrants, findAncestorPath, findNearestHead, companyRootPath } from "./permissions";
import { hasAccess } from "./access";
import { queueTelegramMessage } from "./notifications";
import { Capability, EmploymentStatus, OrgNodeType, VacationStatus, VacationType } from "../generated/prisma/client";

const TYPE_LABELS: Record<string, string> = { ANNUAL: "Щорічна", UNPAID: "За свій рахунок" };

function fmtDate(d: Date): string {
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const MIN_NOTICE_DAYS = 14;
const MAX_ORDINARY_DAYS = 14;
const CONFLICT_RATIO = 0.3;

export type ConflictCheck = {
  isOutOfSchedule: boolean;
  hasConflict: boolean;
  isCriticalPosition: boolean;
  requiresEscalation: boolean;
  conflictNote: string | null;
};

/**
 * Перевірка конфліктів (docs v1.2 §4.2), рахується ДО створення заявки:
 * - >30% одночасно відсутніх штатних одиниць ЦІЄЇ посади в ЦЬОМУ вузлі
 *   (той самий вузол, що й StaffUnit — відділ, якщо є, інакше сам об'єкт);
 * - працівник єдиний на посаді в цьому вузлі — критична посада, потрібен COO;
 * - заявлено менше ніж за 14 днів до початку — "поза графіком";
 * - заявка довша 14 днів.
 * Перетин з інвентаризацією/піковим сезоном НЕ перевіряється — у системі
 * ще немає довідника таких подій, окрема задача.
 */
export async function checkVacationConflicts(employmentId: number, fromDate: Date, toDate: Date): Promise<ConflictCheck> {
  const employment = await prisma.employment.findUniqueOrThrow({ where: { id: employmentId }, include: { staffUnit: true } });

  const peerStaffUnits = await prisma.staffUnit.findMany({
    where: { positionProfileId: employment.staffUnit.positionProfileId, orgNodeId: employment.staffUnit.orgNodeId },
    include: { employments: { where: { status: { not: EmploymentStatus.TERMINATED } }, select: { id: true } } },
  });

  const totalActive = peerStaffUnits.reduce((sum, su) => sum + su.employments.length, 0);
  const peerEmploymentIds = peerStaffUnits.flatMap((su) => su.employments.map((e) => e.id)).filter((id) => id !== employmentId);

  const overlappingApproved = await prisma.vacationRequest.count({
    where: {
      employmentId: { in: peerEmploymentIds },
      status: VacationStatus.APPROVED,
      fromDate: { lte: toDate },
      toDate: { gte: fromDate },
    },
  });

  const isCriticalPosition = totalActive <= 1;
  const absentCount = overlappingApproved + 1; // +1 — сам ініціатор, якщо цю заявку буде погоджено
  const ratio = totalActive > 0 ? absentCount / totalActive : 0;
  const hasConflict = !isCriticalPosition && ratio > CONFLICT_RATIO;

  const daysUntilStart = Math.ceil((fromDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const isOutOfSchedule = daysUntilStart < MIN_NOTICE_DAYS;

  const durationDays = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const isLong = durationDays > MAX_ORDINARY_DAYS;

  const notes: string[] = [];
  if (isCriticalPosition) notes.push("єдиний працівник на цій посаді у цьому вузлі — потрібне погодження COO");
  if (hasConflict) notes.push(`одночасно відсутні ${absentCount} з ${totalActive} (${Math.round(ratio * 100)}%) працівників цієї посади`);
  if (isOutOfSchedule) notes.push("заявлено менше ніж за 14 днів до початку — поза графіком");
  if (isLong) notes.push("заявка довша 14 днів");

  return {
    isOutOfSchedule,
    hasConflict,
    isCriticalPosition,
    requiresEscalation: isOutOfSchedule || hasConflict || isLong,
    conflictNote: notes.length ? notes.join("; ") : null,
  };
}

/**
 * Кого сповістити про нову заявку (docs v1.2 §4.1: "погоджує безпосередній
 * керівник... якщо конфлікт — рівнем вище"). Не той самий розрахунок, що
 * canApproveVacation (той — гейт на дії, цей — кого варто повідомити):
 * критична посада → найближчий керівник від кореня компанії (у seed це
 * фінансовий директор, headEmploymentId кореня); ескальована → найближчий
 * керівник вузла DIVISION (кластер); звичайна → прямий керівник
 * (Employment.managerId), а якщо його нема — найближчий керівник об'єкта.
 */
async function resolveVacationNotifyTarget(employmentId: number, conflict: ConflictCheck): Promise<number | null> {
  const employment = await prisma.employment.findUniqueOrThrow({
    where: { id: employmentId },
    include: { staffUnit: { include: { orgNode: true } } },
  });
  const path = employment.staffUnit.orgNode.path;

  if (conflict.isCriticalPosition) {
    const root = await companyRootPath();
    return root ? findNearestHead(root) : null;
  }

  if (conflict.requiresEscalation) {
    const divisionPath = await findAncestorPath(path, OrgNodeType.DIVISION);
    const head = divisionPath ? await findNearestHead(divisionPath) : null;
    if (head) return head;
  }

  return employment.managerId ?? (await findNearestHead(path));
}

export async function createVacationRequest(
  employmentId: number,
  input: { type: VacationType; fromDate: Date; toDate: Date },
  createdByEmploymentId: number,
): Promise<{ ok: true; requestId: number } | { ok: false; error: string }> {
  if (input.toDate < input.fromDate) return { ok: false, error: "Дата закінчення раніше дати початку" };

  const conflict = await checkVacationConflicts(employmentId, input.fromDate, input.toDate);

  const request = await prisma.vacationRequest.create({
    data: {
      employmentId,
      type: input.type,
      fromDate: input.fromDate,
      toDate: input.toDate,
      isOutOfSchedule: conflict.isOutOfSchedule,
      hasConflict: conflict.hasConflict,
      isCriticalPosition: conflict.isCriticalPosition,
      requiresEscalation: conflict.requiresEscalation,
      conflictNote: conflict.conflictNote,
      createdById: createdByEmploymentId,
    },
    include: { employment: { include: { person: true } } },
  });

  await logAudit({
    actorId: createdByEmploymentId,
    action: "vacation.requested",
    entityType: "VacationRequest",
    entityId: request.id,
    diff: { employmentId, type: input.type, fromDate: input.fromDate, toDate: input.toDate, ...conflict },
  });

  const notifyTargetId = await resolveVacationNotifyTarget(employmentId, conflict);
  if (notifyTargetId) {
    const target = await prisma.employment.findUnique({ where: { id: notifyTargetId }, include: { person: true } });
    if (target?.person.telegramId) {
      const period = `${fmtDate(input.fromDate)} — ${fmtDate(input.toDate)}`;
      const note = conflict.conflictNote ? `\n⚠ ${conflict.conflictNote}` : "";
      await queueTelegramMessage(
        target.person.telegramId,
        `Заявка на відпустку: ${request.employment.person.fullName}, ${TYPE_LABELS[input.type]}, ${period}.${note}\n\nПогодьте або відхиліть у системі.`,
      );
    }
  }

  return { ok: true, requestId: request.id };
}

/** Ранг області — вищий ранг покриває нижчий для потреб ескалації "рівнем вище". */
const SCOPE_RANK: Record<string, number> = {
  SELF: 0,
  SUBORDINATES: 0,
  OWN_DEPARTMENT: 1,
  OWN_OBJECT: 2,
  CUSTOM_NODE: 2,
  OWN_SUBTREE: 3,
  COMPANY: 4,
};

/**
 * Чи може ця людина погодити ЦЮ заявку. Звичайну — досить APPROVE_VACATION
 * з областю, що покриває об'єкт працівника (напр. адміністратор магазину).
 * Ескальовану (>14 днів / конфлікт / поза графіком) — потрібна ширша за
 * OWN_OBJECT область (директор кластера й вище). Критичну посаду — лише
 * COMPANY (docs: "потрібне погодження COO").
 */
export async function canApproveVacation(personId: number, targetOrgNodePath: string, request: { requiresEscalation: boolean; isCriticalPosition: boolean }): Promise<boolean> {
  const grants = await getEffectiveGrants(personId);
  const minRank = request.isCriticalPosition ? 4 : request.requiresEscalation ? 3 : 0;

  for (const g of grants) {
    if (g.capability !== Capability.APPROVE_VACATION) continue;
    if (!g.scopePath || !hasAccess(g.scopePath, targetOrgNodePath)) continue;
    if ((SCOPE_RANK[g.scope] ?? 0) >= minRank) return true;
  }
  return false;
}

export async function decideVacationRequest(
  requestId: number,
  decision: "APPROVED" | "REJECTED",
  decidedByEmploymentId: number,
  rejectReason: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const request = await prisma.vacationRequest.findUnique({
    where: { id: requestId },
    include: { employment: { include: { person: true } } },
  });
  if (!request) return { ok: false, error: "Заявку не знайдено" };
  if (request.status !== VacationStatus.PENDING) return { ok: false, error: "Заявку вже вирішено" };

  await prisma.vacationRequest.update({
    where: { id: requestId },
    data: {
      status: decision === "APPROVED" ? VacationStatus.APPROVED : VacationStatus.REJECTED,
      decidedById: decidedByEmploymentId,
      decidedAt: new Date(),
      rejectReason: decision === "REJECTED" ? rejectReason : null,
    },
  });

  await logAudit({
    actorId: decidedByEmploymentId,
    action: decision === "APPROVED" ? "vacation.approved" : "vacation.rejected",
    entityType: "VacationRequest",
    entityId: requestId,
    diff: { rejectReason },
  });

  // docs v1.2 §4.1: "працівник отримує підтвердження в Telegram" — незалежно
  // від того, чи рішення прийняте в боті, чи у вебі.
  if (request.employment.person.telegramId) {
    const period = `${fmtDate(request.fromDate)} — ${fmtDate(request.toDate)}`;
    const text =
      decision === "APPROVED"
        ? `Вашу заявку на відпустку (${period}) погоджено.`
        : `Вашу заявку на відпустку (${period}) відхилено.${rejectReason ? ` Причина: ${rejectReason}` : ""}`;
    await queueTelegramMessage(request.employment.person.telegramId, text);
  }

  return { ok: true };
}
