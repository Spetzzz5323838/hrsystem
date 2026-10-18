import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { can } from "./permissions";
import { createRatingEvent } from "./rating";
import { leadershipRecipients } from "./inspections";
import { resolveAssignee } from "./onboarding";
import { sendNotification } from "./notificationTemplates";
import { Capability, EmploymentStatus, InspectionRating, RegulationTarget, Role, ViolationStatus } from "../generated/prisma/client";

/** Код приводу в довіднику рейтингу (prisma/seed.ts) — окремий від ручних негативів. */
const RATING_CATEGORY = "regulation_violation";

const takeButton = (violationId: number) => ({ inline_keyboard: [[{ text: "Прийнято в роботу", callback_data: `viol_take:${violationId}` }]] });
export const resolveButton = (violationId: number) => ({ inline_keyboard: [[{ text: "Усунуто", callback_data: `viol_done:${violationId}` }]] });

/**
 * Кому надіслати алерт про нове порушення (рішення 2026-10-18):
 * ділянка — відповідальні, які зараз на зміні (старший зміни — серед них),
 * якщо нікого на зміні — усі відповідальні, якщо їх немає — адмін магазину;
 * індивідуальна вимога — сам працівник; загальна — директор кластера, COO
 * і адмін магазину. Той, хто проводив обхід, повідомлення не отримує.
 */
async function alertRecipients(v: { target: RegulationTarget; areaId: number | null; subjectEmploymentId: number | null; orgNodeId: number }, storePath: string, inspectorPersonId: number) {
  const personIds = new Set<number>();
  const addEmployment = async (employmentId: number | null | undefined) => {
    if (!employmentId) return;
    const e = await prisma.employment.findUnique({ where: { id: employmentId } });
    if (e && e.status !== EmploymentStatus.TERMINATED) personIds.add(e.personId);
  };

  if (v.target === RegulationTarget.PERSON) {
    await addEmployment(v.subjectEmploymentId);
  } else if (v.target === RegulationTarget.AREA && v.areaId) {
    const responsibles = await prisma.areaResponsible.findMany({
      where: { areaId: v.areaId, employment: { status: { not: EmploymentStatus.TERMINATED } } },
      include: { employment: true },
    });
    const onShift = new Set((await prisma.workShift.findMany({ where: { orgNodeId: v.orgNodeId, endedAt: null }, select: { employmentId: true } })).map((s) => s.employmentId));
    const present = responsibles.filter((r) => onShift.has(r.employmentId));
    const chosen = present.length ? present : responsibles;
    for (const r of chosen) personIds.add(r.employment.personId);
    if (!chosen.length) await addEmployment(await resolveAssignee(Role.STORE_ADMIN, storePath));
  } else {
    for (const personId of await leadershipRecipients(storePath)) personIds.add(personId);
  }
  personIds.delete(inspectorPersonId);
  return [...personIds];
}

/**
 * Викликається при завершенні обходу: кожна 🔴-оцінка стає порушенням,
 * для індивідуальної вимоги автоматично пишеться негатив у рейтинг (БЕЗ
 * правила «3-й негатив за тиждень потребує бесіди» — погоджено), і всім
 * зацікавленим іде один алерт на порушення з кнопкою «Прийнято в роботу».
 * Усе робиться саме при завершенні, а не при кожному натисканні: обхідник
 * може передумати, поки заповнює, і не буде хибних повідомлень.
 */
export async function createViolationsForInspection(inspectionId: number, inspectorEmploymentId: number): Promise<number> {
  const inspection = await prisma.inspection.findUniqueOrThrow({ where: { id: inspectionId }, include: { orgNode: true } });
  const inspector = await prisma.employment.findUniqueOrThrow({ where: { id: inspectorEmploymentId } });
  const reds = await prisma.inspectionResult.findMany({
    where: { inspectionId, rating: InspectionRating.RED, violation: null },
    include: { item: true, area: { include: { areaType: true } }, employment: { include: { person: true } } },
  });

  let created = 0;
  for (const r of reds) {
    const comment = r.comment ?? "";
    const violation = await prisma.violation.create({
      data: {
        inspectionId,
        resultId: r.id,
        orgNodeId: inspection.orgNodeId,
        text: r.item.text,
        comment,
        target: r.item.target,
        areaId: r.areaId,
        subjectEmploymentId: r.employmentId,
      },
    });
    created += 1;

    if (r.item.target === RegulationTarget.PERSON && r.employment) {
      const rating = await createRatingEvent({
        personId: r.employment.personId,
        authorEmploymentId: inspectorEmploymentId,
        type: "NEGATIVE",
        categoryCode: RATING_CATEGORY,
        comment: `Обхід: ${r.item.text}. ${comment}`,
        skipConversationRule: true,
      });
      if (rating.ok) await prisma.violation.update({ where: { id: violation.id }, data: { ratingEventId: rating.eventId } });
    }

    const where = r.item.target === RegulationTarget.AREA ? `Ділянка «${r.area?.areaType.name ?? "—"}»` : r.item.target === RegulationTarget.PERSON ? "Зауваження до вашої роботи" : "Загальний стан";
    for (const personId of await alertRecipients(violation, inspection.orgNode.path, inspector.personId)) {
      await sendNotification(personId, "violation.opened", { storeName: inspection.orgNode.name, where, text: r.item.text, comment }, takeButton(violation.id));
    }
    await logAudit({ actorId: inspectorEmploymentId, action: "violation.created", entityType: "Violation", entityId: violation.id, diff: { inspectionId, target: r.item.target } });
  }
  return created;
}

/** Може діяти по порушенню: сам працівник, відповідальний за ділянку або той, хто проводить обходи цього магазину. */
export async function canActOnViolation(personId: number, violationId: number): Promise<{ ok: true; employmentId: number } | { ok: false; error: string }> {
  const v = await prisma.violation.findUnique({ where: { id: violationId }, include: { orgNode: true, subjectEmployment: true } });
  if (!v) return { ok: false, error: "Порушення не знайдено" };
  const employment = await prisma.employment.findFirst({ where: { personId, status: { not: EmploymentStatus.TERMINATED } }, orderBy: { id: "desc" } });
  if (!employment) return { ok: false, error: "Не знайдено активне працевлаштування" };

  if (v.subjectEmployment?.personId === personId) return { ok: true, employmentId: employment.id };
  if (v.areaId) {
    const resp = await prisma.areaResponsible.findFirst({ where: { areaId: v.areaId, employment: { personId } } });
    if (resp) return { ok: true, employmentId: employment.id };
  }
  if (await can(personId, Capability.CONDUCT_INSPECTION, { orgNodePath: v.orgNode.path })) return { ok: true, employmentId: employment.id };
  return { ok: false, error: "Це порушення не стосується вас" };
}

export async function takeViolation(violationId: number, personId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await canActOnViolation(personId, violationId);
  if (!access.ok) return access;
  const v = await prisma.violation.findUniqueOrThrow({ where: { id: violationId } });
  if (v.status !== ViolationStatus.OPEN) return { ok: false, error: v.status === ViolationStatus.IN_PROGRESS ? "Уже прийнято в роботу" : "Порушення вже усунуто" };

  await prisma.violation.update({ where: { id: violationId }, data: { status: ViolationStatus.IN_PROGRESS, takenAt: new Date(), takenById: access.employmentId } });
  await logAudit({ actorId: access.employmentId, action: "violation.taken", entityType: "Violation", entityId: violationId });
  return { ok: true };
}

export async function resolveViolation(violationId: number, personId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await canActOnViolation(personId, violationId);
  if (!access.ok) return access;
  const v = await prisma.violation.findUniqueOrThrow({ where: { id: violationId } });
  if (v.status === ViolationStatus.RESOLVED) return { ok: false, error: "Порушення вже усунуто" };

  await prisma.violation.update({
    where: { id: violationId },
    data: { status: ViolationStatus.RESOLVED, resolvedAt: new Date(), resolvedById: access.employmentId, ...(v.takenAt ? {} : { takenAt: new Date(), takenById: access.employmentId }) },
  });
  await logAudit({ actorId: access.employmentId, action: "violation.resolved", entityType: "Violation", entityId: violationId });
  return { ok: true };
}
