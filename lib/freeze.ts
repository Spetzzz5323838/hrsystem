import { prisma } from "./prisma";
import { EmploymentStatus } from "../generated/prisma/client";
import { logAudit } from "./audit";

export async function freezeEmployment(
  employmentId: number,
  input: { reasonCode: string; plannedReturnAt?: Date; vacatesPosition: boolean },
  actorEmploymentId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const employment = await prisma.employment.findUnique({ where: { id: employmentId } });
  if (!employment) return { ok: false, error: "Не знайдено" };
  if (employment.status !== EmploymentStatus.ACTIVE) {
    return { ok: false, error: "Заморозити можна тільки активного працівника" };
  }

  const reason = await prisma.freezeReason.findUnique({ where: { code: input.reasonCode } });
  if (!reason || !reason.isActive) return { ok: false, error: "Невідома причина заморозки" };

  await prisma.employment.update({
    where: { id: employmentId },
    data: {
      status: EmploymentStatus.FROZEN,
      frozenReasonCode: input.reasonCode,
      frozenSince: new Date(),
      plannedReturnAt: input.plannedReturnAt ?? null,
      freezeVacatesPosition: input.vacatesPosition,
    },
  });

  await logAudit({
    actorId: actorEmploymentId,
    action: "employment.frozen",
    entityType: "Employment",
    entityId: employmentId,
    diff: { reasonCode: input.reasonCode },
  });

  return { ok: true };
}

export type UnfreezeResult = { ok: true; extendedCompetencies: number; frozenDays: number } | { ok: false; error: string };

/**
 * Розморозка: годинник строку дії компетенцій, зупинений на час заморозки,
 * зсуває validUntil на кількість днів заморозки й накопичує frozenDays
 * (docs v1.2 §3 — "інакше людина після декрету виходить із простроченим
 * профілем і мусить перескладати все").
 */
export async function unfreezeEmployment(employmentId: number, actorEmploymentId: number): Promise<UnfreezeResult> {
  const employment = await prisma.employment.findUnique({ where: { id: employmentId } });
  if (!employment) return { ok: false, error: "Не знайдено" };
  if (employment.status !== EmploymentStatus.FROZEN || !employment.frozenSince) {
    return { ok: false, error: "Працівник не заморожений" };
  }

  const frozenDays = Math.floor((Date.now() - employment.frozenSince.getTime()) / (1000 * 60 * 60 * 24));

  const records = await prisma.competencyRecord.findMany({
    where: { personId: employment.personId, validUntil: { not: null } },
  });

  for (const record of records) {
    await prisma.competencyRecord.update({
      where: { id: record.id },
      data: {
        validUntil: new Date(record.validUntil!.getTime() + frozenDays * 24 * 60 * 60 * 1000),
        frozenDays: record.frozenDays + frozenDays,
      },
    });
  }

  await prisma.employment.update({
    where: { id: employmentId },
    data: {
      status: EmploymentStatus.ACTIVE,
      frozenReasonCode: null,
      frozenSince: null,
      plannedReturnAt: null,
      freezeVacatesPosition: null,
    },
  });

  await logAudit({
    actorId: actorEmploymentId,
    action: "employment.unfrozen",
    entityType: "Employment",
    entityId: employmentId,
    diff: { frozenDays },
  });

  return { ok: true, extendedCompetencies: records.length, frozenDays };
}
