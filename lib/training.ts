import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { getCompetencyDelta } from "./competencies";
import { sendNotification } from "./notificationTemplates";
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

/* ───────────── Сповіщення про зміни в плані навчання ───────────── */

const TRAINING_CHANGE_DEBOUNCE_MS = 2 * 60 * 1000;
const MAX_CHANGE_LINES = 8;
// Той самий крок, що в lib/onboarding.ts (MATERIALS_ACK_TASK_TITLE): людям, які ще
// проходять його, нове показується в плані й так — окреме сповіщення зайве.
const MATERIALS_ACK_TITLE = "Ознайомлення з обов'язковими матеріалами";
const NOTIFIABLE_STATUSES: EmploymentStatus[] = [
  EmploymentStatus.TRAINEE,
  EmploymentStatus.READY_FOR_ATTESTATION,
  EmploymentStatus.ACTIVE,
  EmploymentStatus.TRANSFER_PENDING,
];

export type TrainingChangeKind = "MATERIAL_ADDED" | "MATERIAL_UPDATED" | "COMPETENCY_ADDED";

/** Записує, що в навчальному плані щось змінилось; бот розішле зведене повідомлення за кілька хвилин. */
export async function recordTrainingChange(input: { kind: TrainingChangeKind; materialId?: number; competencyId?: number; positionProfileId?: number }): Promise<void> {
  await prisma.trainingChange.create({
    data: { kind: input.kind, materialId: input.materialId ?? null, competencyId: input.competencyId ?? null, positionProfileId: input.positionProfileId ?? null },
  });
}

/**
 * Воркер бота (кожні кілька хвилин): збирає зміни старші за 2 хв (щоб пачка
 * завантажень склалась в одне повідомлення), знаходить працівників відповідних
 * посад і шле кожному ОДНЕ повідомлення зі списком нового.
 */
export async function notifyTrainingChanges(now: Date = new Date()): Promise<{ changes: number; messages: number }> {
  const changes = await prisma.trainingChange.findMany({
    where: { notifiedAt: null, createdAt: { lte: new Date(now.getTime() - TRAINING_CHANGE_DEBOUNCE_MS) } },
    orderBy: { id: "asc" },
  });
  if (!changes.length) return { changes: 0, messages: 0 };

  const linesByPerson = new Map<number, Set<string>>();
  const addLine = (personId: number, line: string) => {
    const set = linesByPerson.get(personId) ?? new Set<string>();
    set.add(line);
    linesByPerson.set(personId, set);
  };

  for (const change of changes) {
    let positionIds: number[] = [];
    let line: string | null = null;

    if (change.kind === "COMPETENCY_ADDED" && change.positionProfileId && change.competencyId) {
      const competency = await prisma.competency.findUnique({ where: { id: change.competencyId } });
      if (competency) {
        positionIds = [change.positionProfileId];
        line = `• Нова компетенція для вашої посади: «${competency.name}»`;
      }
    } else if (change.materialId) {
      const material = await prisma.material.findUnique({ where: { id: change.materialId }, include: { competency: { include: { positionCompetencies: true } } } });
      // Матеріал, який ще нема чого віддати (порожній), чи видалений — не анонсуємо.
      if (material && (material.filePath || material.url)) {
        positionIds = material.competency.positionCompetencies.map((pc) => pc.positionProfileId);
        const verb = change.kind === "MATERIAL_UPDATED" ? "Оновлено матеріал" : "Новий матеріал";
        line = `• ${verb} «${material.title}» (${material.competency.name})`;
      }
    }
    if (!line || !positionIds.length) continue;

    const employments = await prisma.employment.findMany({
      where: { status: { in: NOTIFIABLE_STATUSES }, staffUnit: { positionProfileId: { in: positionIds } } },
      select: { id: true, personId: true },
    });
    for (const e of employments) {
      const onboardingStepOpen = await prisma.task.findFirst({
        where: { assigneeId: e.id, status: "PENDING", itemTemplate: { title: MATERIALS_ACK_TITLE } },
        select: { id: true },
      });
      if (!onboardingStepOpen) addLine(e.personId, line);
    }
  }

  let messages = 0;
  for (const [personId, set] of linesByPerson) {
    const lines = [...set];
    const shown = lines.slice(0, MAX_CHANGE_LINES);
    if (lines.length > MAX_CHANGE_LINES) shown.push(`…і ще ${lines.length - MAX_CHANGE_LINES}`);
    await sendNotification(personId, "training.planUpdated", { list: shown.join("\n") }, { inline_keyboard: [[{ text: "📚 Відкрити навчання", callback_data: "tr:menu" }]] });
    messages += 1;
  }

  await prisma.trainingChange.updateMany({ where: { id: { in: changes.map((c) => c.id) } }, data: { notifiedAt: now } });
  return { changes: changes.length, messages };
}
