import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { getCompetencyDelta } from "./competencies";
import { EmploymentStatus } from "../generated/prisma/client";

/**
 * Чи може ця людина курувати онбординг НА ЦІЙ посаді (правки 20.09.2026,
 * п.9) — двошарова перевірка:
 * 1. Якщо для людини вже налаштовано хоч один явний CuratorEligibility —
 *    рахуємо ЛИШЕ ці явні дозволи (точний per-людина шар, адміністратор
 *    свідомо перейшов на ручне керування для цієї людини).
 * 2. Інакше — стара поведінка "про запас": прапорець PositionProfile.canBeCurator
 *    на власній посаді куратора (щоб не зламати вже робочий онбординг для
 *    всіх, кому цей грант ще ніхто не налаштовував).
 */
export async function isCuratorEligibleFor(employmentId: number, targetPositionProfileId: number): Promise<boolean> {
  const explicitCount = await prisma.curatorEligibility.count({ where: { employmentId } });
  if (explicitCount > 0) {
    const specific = await prisma.curatorEligibility.findUnique({
      where: { employmentId_positionProfileId: { employmentId, positionProfileId: targetPositionProfileId } },
    });
    return !!specific;
  }

  const curator = await prisma.employment.findUnique({ where: { id: employmentId }, include: { staffUnit: { include: { positionProfile: true } } } });
  return curator?.staffUnit.positionProfile.canBeCurator ?? false;
}

export async function listCuratorEligibilities(employmentId: number) {
  return prisma.curatorEligibility.findMany({
    where: { employmentId },
    include: { positionProfile: { select: { id: true, title: true } } },
    orderBy: { positionProfile: { title: "asc" } },
  });
}

/**
 * Видає кураторство на конкретну посаду — лише якщо людина зараз реально
 * має всі чинні обов'язкові компетенції цієї посади ("Куратором можуть
 * виступати тільки працівники, які мають чинні обов'язкові компетенції").
 * Посада без жодної обов'язкової компетенції в довіднику проходить
 * автоматично (нема чого перевіряти).
 */
export async function grantCuratorEligibility(
  employmentId: number,
  positionProfileId: number,
  grantedById: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const employment = await prisma.employment.findUnique({ where: { id: employmentId } });
  if (!employment || employment.status === EmploymentStatus.TERMINATED) return { ok: false, error: "Працівника не знайдено" };

  const position = await prisma.positionProfile.findUnique({ where: { id: positionProfileId } });
  if (!position) return { ok: false, error: "Посаду не знайдено" };

  const delta = await getCompetencyDelta(employment.personId, positionProfileId);
  const gaps = delta.filter((d) => d.state !== "valid");
  if (gaps.length > 0) {
    return { ok: false, error: `Немає чинних компетенцій: ${gaps.map((g) => g.name).join(", ")}` };
  }

  await prisma.curatorEligibility.upsert({
    where: { employmentId_positionProfileId: { employmentId, positionProfileId } },
    update: {},
    create: { employmentId, positionProfileId, grantedById },
  });

  await logAudit({ actorId: grantedById, action: "curatorEligibility.granted", entityType: "Employment", entityId: employmentId, diff: { positionProfileId } });
  return { ok: true };
}

export async function revokeCuratorEligibility(employmentId: number, positionProfileId: number, revokedById: number): Promise<void> {
  await prisma.curatorEligibility.deleteMany({ where: { employmentId, positionProfileId } });
  await logAudit({ actorId: revokedById, action: "curatorEligibility.revoked", entityType: "Employment", entityId: employmentId, diff: { positionProfileId } });
}
