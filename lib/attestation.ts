import { prisma } from "./prisma";
import { completeTask } from "./onboarding";
import { sendNotification } from "./notificationTemplates";
import { findAncestorPath } from "./permissions";
import { logAudit } from "./audit";
import { EmploymentStatus, OrgNodeType } from "../generated/prisma/client";

export type AttestationFormItem = { id: number; order: number; title: string; maxPoints: number };
export type AttestationFormSection = { id: number; order: number; title: string; items: AttestationFormItem[] };
export type AttestationForm = {
  templateId: number;
  passThresholdPercent: number;
  maxScore: number;
  sections: AttestationFormSection[];
};

/** Форма атестації для посади, або null — профіль ще не налаштований (докс §7: SYSADMIN конструює через /catalog). */
export async function getAttestationForm(positionProfileId: number): Promise<AttestationForm | null> {
  const template = await prisma.attestationTemplate.findUnique({
    where: { positionProfileId },
    include: { sections: { orderBy: { order: "asc" }, include: { items: { orderBy: { order: "asc" } } } } },
  });
  if (!template) return null;

  const maxScore = template.sections.reduce((sum, s) => sum + s.items.reduce((s2, i) => s2 + i.maxPoints, 0), 0);

  return {
    templateId: template.id,
    passThresholdPercent: template.passThresholdPercent,
    maxScore,
    sections: template.sections.map((s) => ({
      id: s.id,
      order: s.order,
      title: s.title,
      items: s.items.map((i) => ({ id: i.id, order: i.order, title: i.title, maxPoints: i.maxPoints })),
    })),
  };
}

export type AttestationResult = { ok: true; passed: boolean; percent: number } | { ok: false; error: string };

/**
 * Складання атестації за формою (докс catalogs-v1.1 §7). Пройшло —
 * доручає решту (компетенції, ACTIVE, бейджі) наявній completeTask.
 * Провалено (§7.3): статус повертається в TRAINEE, задача лишається
 * PENDING (можна перескладати — окремого "скинути" пункт 14 не треба,
 * бо перескладання йде через той самий пункт 15), куратору — розбивка
 * по розділах, третя невдала спроба — сповіщення директору кластера.
 */
export async function submitAttestation(
  taskId: number,
  gradedByEmploymentId: number,
  scores: { itemId: number; score: number }[],
): Promise<AttestationResult> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      itemTemplate: true,
      instance: {
        include: {
          employment: {
            include: {
              person: true,
              curator: { include: { person: true } },
              staffUnit: { include: { positionProfile: true, orgNode: true } },
            },
          },
        },
      },
    },
  });
  if (!task) return { ok: false, error: "Задачу не знайдено" };
  if (task.itemTemplate.title !== "Атестація") return { ok: false, error: "Це не пункт атестації" };
  if (task.status === "DONE") return { ok: false, error: "Уже виконано" };

  const employment = task.instance.employment;
  if (employment.status !== EmploymentStatus.READY_FOR_ATTESTATION) {
    return { ok: false, error: "Працівник ще не підтвердив готовність до атестації" };
  }
  const form = await getAttestationForm(employment.staffUnit.positionProfileId);
  if (!form) return { ok: false, error: "Форма атестації для цієї посади не налаштована" };

  const allItemIds = form.sections.flatMap((s) => s.items.map((i) => i.id));
  if (scores.length !== allItemIds.length || allItemIds.some((id) => !scores.some((s) => s.itemId === id))) {
    return { ok: false, error: "Потрібно оцінити всі пункти форми" };
  }
  const maxByItemId = new Map(form.sections.flatMap((s) => s.items.map((i) => [i.id, i.maxPoints] as const)));
  for (const s of scores) {
    const max = maxByItemId.get(s.itemId);
    if (max == null || !Number.isInteger(s.score) || s.score < 0 || s.score > max) {
      return { ok: false, error: "Невірний бал по одному з пунктів" };
    }
  }

  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const percent = (totalScore / form.maxScore) * 100;
  const passed = percent >= form.passThresholdPercent;

  const attemptNumber = (await prisma.attestationAttempt.count({ where: { employmentId: employment.id } })) + 1;

  await prisma.attestationAttempt.create({
    data: {
      employmentId: employment.id,
      attemptNumber,
      totalScore,
      maxScore: form.maxScore,
      passThresholdPercent: form.passThresholdPercent,
      passed,
      gradedById: gradedByEmploymentId,
      itemScores: { create: scores.map((s) => ({ itemId: s.itemId, score: s.score })) },
    },
  });

  if (passed) {
    const result = await completeTask(taskId, gradedByEmploymentId);
    if (!result.ok) return result;
    return { ok: true, passed: true, percent };
  }

  await prisma.employment.update({ where: { id: employment.id }, data: { status: EmploymentStatus.TRAINEE } });
  await logAudit({
    actorId: gradedByEmploymentId,
    action: "attestation.failed",
    entityType: "Employment",
    entityId: employment.id,
    diff: { attemptNumber, totalScore, maxScore: form.maxScore, percent: Math.round(percent) },
  });

  if (employment.curator) {
    const scoreByItemId = new Map(scores.map((s) => [s.itemId, s.score]));
    const sectionLines = form.sections.map((section) => {
      const sectionMax = section.items.reduce((sum, i) => sum + i.maxPoints, 0);
      const sectionScore = section.items.reduce((sum, i) => sum + (scoreByItemId.get(i.id) ?? 0), 0);
      return `• ${section.title}: ${sectionScore}/${sectionMax}`;
    });
    await sendNotification(employment.curator.personId, "attestation.failedCurator", {
      fullName: employment.person.fullName,
      attemptNumber: String(attemptNumber),
      percent: String(Math.round(percent)),
      threshold: String(form.passThresholdPercent),
      sections: sectionLines.join("\n"),
    });
  }

  if (attemptNumber >= 3) {
    const divisionPath = await findAncestorPath(employment.staffUnit.orgNode.path, OrgNodeType.DIVISION);
    const divisionNode = divisionPath ? await prisma.orgNode.findFirst({ where: { path: divisionPath } }) : null;
    if (divisionNode?.headEmploymentId) {
      const head = await prisma.employment.findUnique({ where: { id: divisionNode.headEmploymentId }, include: { person: true } });
      if (head) {
        await sendNotification(head.personId, "attestation.thirdFailEscalation", {
          fullName: employment.person.fullName,
          percent: String(Math.round(percent)),
        });
      }
    }
  }

  return { ok: true, passed: false, percent };
}
