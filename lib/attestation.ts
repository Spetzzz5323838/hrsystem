import { prisma } from "./prisma";
import { completeTask } from "./onboarding";
import { sendNotification } from "./notificationTemplates";
import { findAncestorPath } from "./permissions";
import { logAudit } from "./audit";
import { EmploymentStatus, OrgNodeType, CompetencySource } from "../generated/prisma/client";

export type AttestationFormRow = { competencyId: number; code: string; name: string; isRequired: boolean };
export type AttestationForm = { positionProfileId: number; rows: AttestationFormRow[] };

/**
 * Форма атестації тепер не конструюється вручну — це просто список
 * компетенцій посади (тема "посада — компетенції — атестація", 2026-09-25,
 * замінює старий текстовий конструктор розділів/пунктів). Позиція без
 * жодної компетенції — форми немає (null), і на екрані лишається проста
 * кнопка "Пройдено" без табеля (стара поведінка).
 */
export async function getAttestationForm(positionProfileId: number): Promise<AttestationForm | null> {
  const rows = await prisma.positionCompetency.findMany({
    where: { positionProfileId },
    include: { competency: true },
    orderBy: { competency: { name: "asc" } },
  });
  if (!rows.length) return null;

  return {
    positionProfileId,
    rows: rows.map((r) => ({ competencyId: r.competencyId, code: r.competency.code, name: r.competency.name, isRequired: r.isRequired })),
  };
}

export type AttestationResult = { ok: true; passed: boolean; missingRequired: string[] } | { ok: false; error: string };

/**
 * Складання атестації — табель по компетенціях, не текстова форма (докс
 * catalogs-v1.1 §7 у старому вигляді більше не діє, див. lib/attestation.ts
 * git-історію). Бал 0/1/2 на кожну компетенцію посади; 1 і 2 — зараховано.
 * Пройшло — коли зараховані ВСІ обов'язкові (isRequired=true); рекомендовані
 * оцінюються, але не блокують. Записуємо CompetencyRecord лише для рядків
 * з балом ≥1 і лише коли атестація в цілому пройдена (той самий принцип,
 * що й раніше — не зараховувати нічого з провальної спроби, перескладання
 * йде по всій формі заново, це живий іспит, не накопичувальний прогрес).
 * Провалено — статус назад у TRAINEE, задача лишається PENDING (можна
 * перескладати), куратору — які саме компетенції провалені, третя невдала
 * спроба — сповіщення директору кластера.
 */
export async function submitAttestation(
  taskId: number,
  gradedByEmploymentId: number,
  scores: { competencyId: number; score: number }[],
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
  if (!form) return { ok: false, error: "Атестація для цієї посади не налаштована (немає компетенцій)" };

  const formCompetencyIds = form.rows.map((r) => r.competencyId);
  if (scores.length !== formCompetencyIds.length || formCompetencyIds.some((id) => !scores.some((s) => s.competencyId === id))) {
    return { ok: false, error: "Потрібно оцінити всі компетенції форми" };
  }
  for (const s of scores) {
    if (!Number.isInteger(s.score) || s.score < 0 || s.score > 2) {
      return { ok: false, error: "Бал має бути 0, 1 або 2" };
    }
  }

  const scoreByCompetencyId = new Map(scores.map((s) => [s.competencyId, s.score]));
  const missingRequired = form.rows.filter((r) => r.isRequired && (scoreByCompetencyId.get(r.competencyId) ?? 0) < 1);
  const passed = missingRequired.length === 0;

  const attemptNumber = (await prisma.attestationAttempt.count({ where: { employmentId: employment.id } })) + 1;

  await prisma.attestationAttempt.create({
    data: {
      employmentId: employment.id,
      attemptNumber,
      passed,
      gradedById: gradedByEmploymentId,
      competencyScores: { create: scores.map((s) => ({ competencyId: s.competencyId, score: s.score })) },
    },
  });

  if (passed) {
    const now = new Date();
    for (const s of scores.filter((s) => s.score >= 1)) {
      const competency = await prisma.competency.findUniqueOrThrow({ where: { id: s.competencyId } });
      const validUntil = competency.validMonths ? new Date(now.getFullYear(), now.getMonth() + competency.validMonths, now.getDate()) : null;
      await prisma.competencyRecord.create({
        data: {
          personId: employment.personId,
          competencyId: s.competencyId,
          passedAt: now,
          score: s.score,
          validUntil,
          source: CompetencySource.ATTESTATION,
        },
      });
    }

    const result = await completeTask(taskId, gradedByEmploymentId, { skipCompetencyAutoClose: true });
    if (!result.ok) return result;
    return { ok: true, passed: true, missingRequired: [] };
  }

  await prisma.employment.update({ where: { id: employment.id }, data: { status: EmploymentStatus.TRAINEE } });
  await logAudit({
    actorId: gradedByEmploymentId,
    action: "attestation.failed",
    entityType: "Employment",
    entityId: employment.id,
    diff: { attemptNumber, missingRequired: missingRequired.map((r) => r.code) },
  });

  if (employment.curator) {
    await sendNotification(employment.curator.personId, "attestation.failedCurator", {
      fullName: employment.person.fullName,
      attemptNumber: String(attemptNumber),
      missing: missingRequired.map((r) => r.name).join(", "),
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
          missing: missingRequired.map((r) => r.name).join(", "),
        });
      }
    }
  }

  return { ok: true, passed: false, missingRequired: missingRequired.map((r) => r.name) };
}
