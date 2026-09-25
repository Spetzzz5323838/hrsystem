import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { sendNotification } from "./notificationTemplates";
import { resolveAssignee } from "./onboarding";
import { getEffectiveGrants } from "./permissions";
import { Capability, Role, VacancyReason, VacancyStatus } from "../generated/prisma/client";

/**
 * Області, де людина має MANAGE_VACANCIES — той самий принцип, що
 * lib/analytics.ts::getAnalyticsScopePaths. OWN_OBJECT в адміністратора
 * магазину, OWN_SUBTREE в кластерного керівника — та сама можливість
 * (з профілю "Повне управління персоналом"), різна область, тому
 * кластерний керівник автоматично бачить "зведення" по всьому кластеру
 * без окремого механізму.
 */
export async function getVacancyScopePaths(personId: number): Promise<string[]> {
  const grants = await getEffectiveGrants(personId);
  const paths = new Set<string>();
  for (const grant of grants) {
    if (grant.capability === Capability.MANAGE_VACANCIES && grant.scopePath) paths.add(grant.scopePath);
  }
  return [...paths];
}

/**
 * Задача "закрити вакансію" (з розмови 2026-09-23, поза докс) — проста
 * задача-нагадування адміністратору об'єкта, НЕ картка кандидатів.
 */
export async function createVacancy(
  staffUnitId: number,
  reason: VacancyReason,
  createdById: number | null,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const staffUnit = await prisma.staffUnit.findUnique({ where: { id: staffUnitId }, include: { positionProfile: true, orgNode: true } });
  if (!staffUnit) return { ok: false, error: "Штатну одиницю не знайдено" };

  const vacancy = await prisma.vacancy.create({ data: { staffUnitId, reason, createdById } });

  await logAudit({ actorId: createdById, action: "vacancy.created", entityType: "Vacancy", entityId: vacancy.id, diff: { staffUnitId, reason } });

  // Сповіщення адміністратору об'єкта (той самий принцип, що й для
  // резолвінгу виконавців чек-листа) — навіть якщо вакансію завела не він,
  // а, наприклад, звільнення ініціював хтось інший.
  const assigneeId = await resolveAssignee(Role.STORE_ADMIN, staffUnit.orgNode.path);
  if (assigneeId) {
    const assignee = await prisma.employment.findUnique({ where: { id: assigneeId }, include: { person: true } });
    if (assignee) {
      await sendNotification(assignee.personId, "vacancy.opened", {
        positionTitle: staffUnit.positionProfile.title,
        objectName: staffUnit.orgNode.name,
        reason: VACANCY_REASON_LABELS[reason],
      });
    }
  }

  return { ok: true, id: vacancy.id };
}

export const VACANCY_REASON_LABELS: Record<VacancyReason, string> = {
  TERMINATION: "звільнення працівника",
  NEW_POSITION: "нова посада",
  HEADCOUNT_INCREASE: "збільшення штату",
};

export async function listVacancies(scopePaths: string[], includeClosed: boolean) {
  return prisma.vacancy.findMany({
    where: {
      staffUnit: { orgNode: { OR: scopePaths.map((p) => ({ OR: [{ path: p }, { path: { startsWith: `${p}.` } }] })) } },
      ...(includeClosed ? {} : { status: { not: VacancyStatus.CLOSED } }),
    },
    include: { staffUnit: { include: { positionProfile: true, orgNode: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function updateVacancy(
  vacancyId: number,
  patch: { status?: VacancyStatus; note?: string | null },
  actorId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const vacancy = await prisma.vacancy.findUnique({ where: { id: vacancyId } });
  if (!vacancy) return { ok: false, error: "Вакансію не знайдено" };
  if (vacancy.status === VacancyStatus.CLOSED) return { ok: false, error: "Вакансія вже закрита" };

  const data: { status?: VacancyStatus; note?: string | null; postedAt?: Date; closedAt?: Date; closedById?: number } = {};
  if (patch.note !== undefined) data.note = patch.note;
  if (patch.status) {
    data.status = patch.status;
    if (patch.status === VacancyStatus.POSTED) data.postedAt = new Date();
    if (patch.status === VacancyStatus.CLOSED) {
      data.closedAt = new Date();
      data.closedById = actorId;
    }
  }

  await prisma.vacancy.update({ where: { id: vacancyId }, data });
  await logAudit({ actorId, action: patch.status === VacancyStatus.CLOSED ? "vacancy.closed" : "vacancy.updated", entityType: "Vacancy", entityId: vacancyId, diff: patch });

  return { ok: true };
}
