import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { getCompetencyDelta } from "./competencies";
import { EmploymentStatus, MaterialType } from "../generated/prisma/client";

/**
 * Навчальний план працівника для бота й веб-карток (2026-10-28): компетенції
 * посади → їхні матеріали → прогрес ознайомлення. Працівник сам запитує
 * матеріал ("отримав") і сам відмічає "переглянув"; адміністратор бачить цей
 * прогрес у картці. Рейтингових балів за відмітки немає: це самозвіт.
 *
 * Обов'язковими для кроку онбордингу "Ознайомлення з обов'язковими матеріалами"
 * вважаються матеріали ОБОВ'ЯЗКОВИХ компетенцій посади, які в людини ще не
 * складені (відсутні чи прострочені) і які реально можна отримати (є файл або
 * посилання). Рекомендовані компетенції показуються, але крок не блокують.
 */
export type MaterialStatus = "new" | "received" | "viewed" | "updated";

export type TrainingMaterial = {
  id: number;
  title: string;
  type: MaterialType;
  durationMin: number | null;
  /** Є що віддати: файл на сервері або посилання. */
  deliverable: boolean;
  status: MaterialStatus;
  requestedAt: Date | null;
  viewedAt: Date | null;
};

export type TrainingCompetency = {
  competencyId: number;
  name: string;
  isRequired: boolean;
  state: "valid" | "missing" | "expired";
  /** Матеріали цієї компетенції входять у перелік обов'язкових для ознайомлення. */
  mandatory: boolean;
  materials: TrainingMaterial[];
  viewedCount: number;
};

export type TrainingPlan = {
  employmentId: number;
  positionTitle: string;
  competencies: TrainingCompetency[];
  requiredTotal: number;
  requiredViewed: number;
};

export async function findActiveEmployment(personId: number) {
  return prisma.employment.findFirst({
    where: { personId, status: { not: EmploymentStatus.TERMINATED } },
    orderBy: { id: "desc" },
    include: { staffUnit: { include: { positionProfile: true } } },
  });
}

export async function getTrainingPlan(personId: number): Promise<TrainingPlan | null> {
  const employment = await findActiveEmployment(personId);
  if (!employment) return null;
  const positionProfileId = employment.staffUnit.positionProfileId;

  const [positionCompetencies, delta, progressRows] = await Promise.all([
    prisma.positionCompetency.findMany({
      where: { positionProfileId },
      include: { competency: { include: { materials: { orderBy: { id: "asc" } } } } },
    }),
    getCompetencyDelta(personId, positionProfileId),
    prisma.materialProgress.findMany({ where: { personId } }),
  ]);
  const stateByCompetency = new Map(delta.map((d) => [d.competencyId, d.state]));
  const progressByMaterial = new Map(progressRows.map((p) => [p.materialId, p]));

  const competencies: TrainingCompetency[] = positionCompetencies
    .filter((pc) => pc.competency.materials.length > 0)
    .map((pc) => {
      const state = stateByCompetency.get(pc.competencyId) ?? "missing";
      const mandatory = pc.isRequired && state !== "valid";
      const materials: TrainingMaterial[] = pc.competency.materials.map((m) => {
        const p = progressByMaterial.get(m.id);
        let status: MaterialStatus = "new";
        if (p?.viewedAt) {
          // Матеріал оновили після перегляду — треба переглянути знову.
          status = m.contentUpdatedAt && m.contentUpdatedAt > p.viewedAt ? "updated" : "viewed";
        } else if (p?.requestedAt) status = "received";
        return {
          id: m.id,
          title: m.title,
          type: m.type,
          durationMin: m.durationMin,
          deliverable: Boolean(m.filePath || m.url),
          status,
          requestedAt: p?.requestedAt ?? null,
          viewedAt: p?.viewedAt ?? null,
        };
      });
      return {
        competencyId: pc.competencyId,
        name: pc.competency.name,
        isRequired: pc.isRequired,
        state,
        mandatory,
        materials,
        viewedCount: materials.filter((m) => m.status === "viewed").length,
      };
    })
    .sort((a, b) => Number(b.mandatory) - Number(a.mandatory) || a.name.localeCompare(b.name, "uk"));

  const required = competencies.filter((c) => c.mandatory).flatMap((c) => c.materials.filter((m) => m.deliverable));
  return {
    employmentId: employment.id,
    positionTitle: employment.staffUnit.positionProfile.title,
    competencies,
    requiredTotal: required.length,
    requiredViewed: required.filter((m) => m.status === "viewed").length,
  };
}

/** Матеріал, доступний цій людині за її планом (захист від запиту чужих матеріалів через callback). */
export async function getMaterialInPlan(personId: number, materialId: number) {
  const plan = await getTrainingPlan(personId);
  if (!plan) return null;
  for (const c of plan.competencies) {
    const m = c.materials.find((x) => x.id === materialId);
    if (m) return { plan, competency: c, material: m };
  }
  return null;
}

/** Працівник запитав матеріал (файл/посилання відправляє бот). */
export async function markReceived(personId: number, materialId: number): Promise<void> {
  const now = new Date();
  await prisma.materialProgress.upsert({
    where: { personId_materialId: { personId, materialId } },
    create: { personId, materialId, requestedAt: now },
    update: { requestedAt: now },
  });
}

/** Працівник відмітив "переглянув". Спершу матеріал треба отримати. */
export async function markViewed(personId: number, materialId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const found = await getMaterialInPlan(personId, materialId);
  if (!found) return { ok: false, error: "Цього матеріалу немає у вашому плані" };

  const progress = await prisma.materialProgress.findUnique({ where: { personId_materialId: { personId, materialId } } });
  if (!progress?.requestedAt) return { ok: false, error: "Спершу отримайте матеріал, потім відмітьте, що переглянули" };
  if (found.material.status === "viewed") return { ok: true };

  await prisma.materialProgress.update({ where: { id: progress.id }, data: { viewedAt: new Date() } });
  const employment = await findActiveEmployment(personId);
  await logAudit({ actorId: employment?.id ?? null, action: "material.viewed", entityType: "Material", entityId: materialId });
  return { ok: true };
}
