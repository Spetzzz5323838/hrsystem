import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { getSessionPerson } from "./auth";
import { createViolationsForInspection } from "./violations";
import { can } from "./permissions";
import { Capability, EmploymentStatus, InspectionKind, InspectionRating, InspectionStatus, RegulationTarget } from "../generated/prisma/client";

const PHOTO_ROOT = path.join(process.cwd(), "storage", "inspections");
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Статуси, за яких працівника можна оцінювати індивідуально (ті ж, що й для терміналу). */
const RATABLE_STATUSES: EmploymentStatus[] = [
  EmploymentStatus.TRAINEE,
  EmploymentStatus.READY_FOR_ATTESTATION,
  EmploymentStatus.ACTIVE,
  EmploymentStatus.TERMINATION_STARTED,
  EmploymentStatus.TRANSFER_PENDING,
];

export type Checkpoint = {
  key: string;
  itemId: number;
  text: string;
  target: RegulationTarget;
  /** Підпис блоку: «Загальний стан», назва ділянки або «ПІБ · посада». */
  section: string;
  areaId: number | null;
  employmentId: number | null;
  result: { id: number; rating: InspectionRating; comment: string | null; hasPhoto: boolean } | null;
};

export const checkpointKey = (itemId: number, areaId: number | null, employmentId: number | null) => `${itemId}:${areaId ?? 0}:${employmentId ?? 0}`;

/**
 * Що саме оцінювати в цьому обході. Загальні вимоги — по одній; вимоги до
 * ділянки — для кожної активної ділянки цього типу в магазині; індивідуальні —
 * для працівників посади, які зараз на зміні (а якщо в магазині ще ніхто не
 * відмічається на терміналі — для всіх чинних працівників посади).
 * Щоденний обхід бере лише вимоги з inDaily, щотижневий — усі.
 */
export async function buildCheckpoints(inspectionId: number): Promise<{ checkpoints: Checkpoint[]; notes: string[] } | null> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: { results: true, regulationVersion: { include: { items: { orderBy: { sortOrder: "asc" }, include: { areaType: true, positionProfile: true } } } } },
  });
  if (!inspection?.regulationVersion) return null;

  const items = inspection.regulationVersion.items.filter((i) => inspection.kind === InspectionKind.WEEKLY || i.inDaily);
  const areas = await prisma.area.findMany({ where: { orgNodeId: inspection.orgNodeId, isActive: true }, include: { areaType: true } });

  const openShifts = await prisma.workShift.findMany({ where: { orgNodeId: inspection.orgNodeId, endedAt: null }, select: { employmentId: true } });
  const employmentFilter = openShifts.length
    ? { id: { in: openShifts.map((s) => s.employmentId) } }
    : { status: { in: RATABLE_STATUSES }, staffUnit: { orgNodeId: inspection.orgNodeId } };
  const people = await prisma.employment.findMany({ where: employmentFilter, include: { person: true, staffUnit: { include: { positionProfile: true } } } });

  const resultByKey = new Map(inspection.results.map((r) => [checkpointKey(r.itemId, r.areaId, r.employmentId), r]));
  const toResult = (key: string): Checkpoint["result"] => {
    const r = resultByKey.get(key);
    return r ? { id: r.id, rating: r.rating, comment: r.comment, hasPhoto: Boolean(r.photoPath) } : null;
  };

  const checkpoints: Checkpoint[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  const push = (cp: Omit<Checkpoint, "key" | "result">) => {
    const key = checkpointKey(cp.itemId, cp.areaId, cp.employmentId);
    if (seen.has(key)) return;
    seen.add(key);
    checkpoints.push({ ...cp, key, result: toResult(key) });
  };

  for (const item of items) {
    if (item.target === RegulationTarget.GENERAL) {
      push({ itemId: item.id, text: item.text, target: item.target, section: "Загальний стан", areaId: null, employmentId: null });
    } else if (item.target === RegulationTarget.AREA) {
      for (const a of areas.filter((x) => x.areaTypeId === item.areaTypeId)) {
        push({ itemId: item.id, text: item.text, target: item.target, section: a.areaType.name, areaId: a.id, employmentId: null });
      }
    } else {
      const matching = people.filter((p) => p.staffUnit.positionProfileId === item.positionProfileId);
      if (!matching.length) notes.push(`Немає на зміні: ${item.positionProfile?.title ?? "посада"} — «${item.text}» пропущено`);
      for (const p of matching) {
        push({ itemId: item.id, text: item.text, target: item.target, section: `${p.person.fullName} · ${p.staffUnit.positionProfile.title}`, areaId: null, employmentId: p.id });
      }
    }
  }

  // Оцінки, поставлені раніше для суб'єктів, яких зараз у списку нема (працівник пішов зі зміни, ділянку знято) — лишаємо видимими.
  const known = new Map(inspection.regulationVersion.items.map((i) => [i.id, i]));
  for (const r of inspection.results) {
    const key = checkpointKey(r.itemId, r.areaId, r.employmentId);
    if (seen.has(key)) continue;
    const item = known.get(r.itemId);
    if (!item) continue;
    let section = "Загальний стан";
    if (r.areaId) section = areas.find((a) => a.id === r.areaId)?.areaType.name ?? "Ділянка";
    if (r.employmentId) {
      const e = await prisma.employment.findUnique({ where: { id: r.employmentId }, include: { person: true, staffUnit: { include: { positionProfile: true } } } });
      section = e ? `${e.person.fullName} · ${e.staffUnit.positionProfile.title}` : "Працівник";
    }
    push({ itemId: item.id, text: item.text, target: item.target, section, areaId: r.areaId, employmentId: r.employmentId });
  }

  return { checkpoints, notes };
}

/** Початок обходу: фіксуємо чинну версію регламенту (обхід далі не залежить від наступних правок). */
export async function startInspection(inspectionId: number, actorEmploymentId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) return { ok: false, error: "Обхід не знайдено" };
  if (inspection.status === InspectionStatus.IN_PROGRESS) return { ok: true };
  if (inspection.status !== InspectionStatus.PLANNED) return { ok: false, error: "Цей обхід уже завершено або скасовано" };

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (inspection.plannedFor.getTime() > endOfToday.getTime()) {
    return { ok: false, error: `Обхід заплановано на ${inspection.plannedFor.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — раніше розпочати не можна` };
  }

  const version = await prisma.regulationVersion.findFirst({ where: { isCurrent: true } });
  if (!version) return { ok: false, error: "Регламент обходів ще не створено" };

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: InspectionStatus.IN_PROGRESS, startedAt: new Date(), conductedById: actorEmploymentId, regulationVersionId: version.id },
  });
  await logAudit({ actorId: actorEmploymentId, action: "inspection.started", entityType: "Inspection", entityId: inspectionId, diff: { regulationVersion: version.version } });
  return { ok: true };
}

export type SaveResultInput = {
  itemId: number;
  areaId: number | null;
  employmentId: number | null;
  rating: InspectionRating;
  comment: string | null;
};

/** Зберігає (або змінює) оцінку. 🔴 вимагає коментар; повторне натискання іншого кольору переписує оцінку. */
export async function saveResult(inspectionId: number, input: SaveResultInput): Promise<{ ok: true; resultId: number } | { ok: false; error: string }> {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection || inspection.status !== InspectionStatus.IN_PROGRESS) return { ok: false, error: "Обхід не розпочато або вже завершено" };

  if (![InspectionRating.GREEN, InspectionRating.YELLOW, InspectionRating.RED].includes(input.rating)) return { ok: false, error: "Невірна оцінка" };
  const comment = input.comment?.trim() || null;
  if (input.rating === InspectionRating.RED && (!comment || comment.length < 3)) return { ok: false, error: "Для 🔴 коментар обов’язковий" };
  if (comment && comment.length > 1000) return { ok: false, error: "Коментар задовгий (максимум 1000 символів)" };

  const built = await buildCheckpoints(inspectionId);
  const key = checkpointKey(input.itemId, input.areaId, input.employmentId);
  if (!built?.checkpoints.some((c) => c.key === key)) return { ok: false, error: "Такої вимоги в цьому обході немає" };

  const existing = await prisma.inspectionResult.findFirst({ where: { inspectionId, itemId: input.itemId, areaId: input.areaId, employmentId: input.employmentId } });
  const data = { rating: input.rating, comment, ratedAt: new Date() };
  // Зелений колір фото не потребує — стара фотографія від попередньої оцінки теж зайва.
  if (existing) {
    if (input.rating === InspectionRating.GREEN && existing.photoPath) await removePhoto(existing.photoPath);
    const updated = await prisma.inspectionResult.update({ where: { id: existing.id }, data: { ...data, ...(input.rating === InspectionRating.GREEN ? { photoPath: null } : {}) } });
    return { ok: true, resultId: updated.id };
  }
  const created = await prisma.inspectionResult.create({ data: { inspectionId, itemId: input.itemId, areaId: input.areaId, employmentId: input.employmentId, ...data } });
  return { ok: true, resultId: created.id };
}

async function removePhoto(relPath: string) {
  await fs.rm(path.join(process.cwd(), "storage", relPath), { force: true }).catch(() => undefined);
}

/** Фото до оцінки (необов'язкове). Пишемо на локальний диск, віддаємо лише через роут із перевіркою прав. */
export async function savePhoto(
  inspectionId: number,
  resultId: number,
  file: { buffer: Buffer; mimeType: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ext = PHOTO_TYPES[file.mimeType];
  if (!ext) return { ok: false, error: "Фото має бути у форматі JPEG, PNG або WebP" };
  if (file.buffer.length > MAX_PHOTO_BYTES) return { ok: false, error: "Фото завелике (максимум 8 МБ)" };

  const result = await prisma.inspectionResult.findFirst({ where: { id: resultId, inspectionId }, include: { inspection: true } });
  if (!result) return { ok: false, error: "Оцінку не знайдено" };
  if (result.inspection.status !== InspectionStatus.IN_PROGRESS) return { ok: false, error: "Обхід уже завершено" };
  if (result.rating === InspectionRating.GREEN) return { ok: false, error: "Фото додається лише до 🟡 і 🔴" };

  const rel = path.join("inspections", String(inspectionId), `${resultId}.${ext}`);
  await fs.mkdir(path.join(PHOTO_ROOT, String(inspectionId)), { recursive: true });
  if (result.photoPath && result.photoPath !== rel) await removePhoto(result.photoPath);
  await fs.writeFile(path.join(process.cwd(), "storage", rel), file.buffer);
  await prisma.inspectionResult.update({ where: { id: resultId }, data: { photoPath: rel } });
  return { ok: true };
}

export async function readPhoto(resultId: number): Promise<{ buffer: Buffer; mimeType: string; orgNodeId: number } | null> {
  const result = await prisma.inspectionResult.findUnique({ where: { id: resultId }, include: { inspection: true } });
  if (!result?.photoPath) return null;
  const ext = path.extname(result.photoPath).slice(1);
  const mimeType = Object.entries(PHOTO_TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
  try {
    return { buffer: await fs.readFile(path.join(process.cwd(), "storage", result.photoPath)), mimeType, orgNodeId: result.inspection.orgNodeId };
  } catch {
    return null;
  }
}

/** Завершення: усі вимоги мають бути оцінені. Зв'язок із порушеннями й рейтингом — етап 8. */
export async function completeInspection(inspectionId: number, actorEmploymentId: number): Promise<{ ok: true; violations: number } | { ok: false; error: string }> {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection || inspection.status !== InspectionStatus.IN_PROGRESS) return { ok: false, error: "Обхід не розпочато або вже завершено" };

  const built = await buildCheckpoints(inspectionId);
  const unrated = built?.checkpoints.filter((c) => !c.result).length ?? 0;
  if (unrated > 0) return { ok: false, error: `Лишилось неоцінених вимог: ${unrated}` };

  await prisma.inspection.update({ where: { id: inspectionId }, data: { status: InspectionStatus.COMPLETED, completedAt: new Date() } });
  await logAudit({ actorId: actorEmploymentId, action: "inspection.completed", entityType: "Inspection", entityId: inspectionId });
  const violations = await createViolationsForInspection(inspectionId, actorEmploymentId);
  return { ok: true, violations };
}

/** Єдина перевірка для роутів обходу: залогований + має CONDUCT_INSPECTION на магазин обходу. */
export async function requireInspector(inspectionId: number) {
  const session = await getSessionPerson();
  if (!session) return { ok: false as const, status: 401, error: "Не залогований" };
  const inspection = Number.isInteger(inspectionId) ? await prisma.inspection.findUnique({ where: { id: inspectionId }, include: { orgNode: true } }) : null;
  if (!inspection) return { ok: false as const, status: 404, error: "Обхід не знайдено" };
  if (!(await can(session.id, Capability.CONDUCT_INSPECTION, { orgNodePath: inspection.orgNode.path }))) {
    return { ok: false as const, status: 403, error: "Немає права проводити обходи цього магазину" };
  }
  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } }, orderBy: { id: "desc" } });
  if (!actor) return { ok: false as const, status: 400, error: "Не знайдено активне працевлаштування" };
  return { ok: true as const, session, actor, inspection };
}
