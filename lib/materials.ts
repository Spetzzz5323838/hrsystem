import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";
import { sendTelegramDocument, sendTelegramMessage } from "./telegram";
import { logAudit } from "./audit";
import { MaterialType } from "../generated/prisma/client";

// Файли матеріалів — поза `public/`, як і скани документів (не роздаються
// напряму статикою, тільки через перевірений роут).
const STORAGE_ROOT = path.join(process.cwd(), "storage", "materials");

const ALLOWED_MIME_TYPES: Record<string, { ext: string; maxSize: number }> = {
  "application/pdf": { ext: ".pdf", maxSize: 50 * 1024 * 1024 },
  // Відео теж надсилаються в Telegram за запитом працівника (кнопка «Отримати»), а Telegram приймає файли до 50 МБ.
  "video/mp4": { ext: ".mp4", maxSize: 50 * 1024 * 1024 },
  "video/webm": { ext: ".webm", maxSize: 50 * 1024 * 1024 },
  "video/quicktime": { ext: ".mov", maxSize: 50 * 1024 * 1024 },
};

export type SaveMaterialFileInput = {
  competencyId: number;
  title: string;
  type: MaterialType;
  durationMin: number | null;
  sendViaBot: boolean;
  file: File;
};

/**
 * Публікація матеріалу з реальним завантаженням файлу (спрощення для
 * нетехнічного користувача, 2026-09-25) — файл фізично лягає на диск
 * сервера, посилання users вручну не пише. VIDEO ігнорує sendViaBot —
 * докс plan-v1.md §9.1: відео лише через Wi-Fi інтранет, не через бот.
 */
export async function saveMaterialFile(input: SaveMaterialFileInput): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const mime = ALLOWED_MIME_TYPES[input.file.type];
  if (!mime) return { ok: false, error: "Дозволені файли: PDF або відео (MP4/WebM/MOV)" };
  if (input.file.size > mime.maxSize) {
    return { ok: false, error: `Файл завеликий (максимум ${Math.round(mime.maxSize / 1024 / 1024)} МБ)` };
  }

  const dir = path.join(STORAGE_ROOT, String(input.competencyId));
  await fs.mkdir(dir, { recursive: true });

  const fileName = `${Date.now()}${mime.ext}`;
  const filePath = path.join(dir, fileName);
  const buffer = Buffer.from(await input.file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  const material = await prisma.material.create({
    data: {
      competencyId: input.competencyId,
      title: input.title,
      type: input.type,
      durationMin: input.durationMin,
      sendViaBot: input.sendViaBot,
      filePath,
      originalName: input.file.name,
      mimeType: input.file.type,
    },
  });

  return { ok: true, id: material.id };
}

/**
 * Заміна файлу вже наявного матеріалу — старий видаляється з диска
 * фізично (легкий журнал, 2026-09-27: сам вміст старої версії не
 * зберігається, лише хто/коли замінив — Material.contentUpdatedAt/
 * contentUpdatedById для швидкої позначки в списку + повний AuditLog
 * на кожну заміну для тих, кому потрібна історія).
 */
export async function replaceMaterialFile(materialId: number, file: File, actorId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await prisma.material.findUnique({ where: { id: materialId } });
  if (!existing) return { ok: false, error: "Матеріал не знайдено" };

  const mime = ALLOWED_MIME_TYPES[file.type];
  if (!mime) return { ok: false, error: "Дозволені файли: PDF або відео (MP4/WebM/MOV)" };
  if (file.size > mime.maxSize) {
    return { ok: false, error: `Файл завеликий (максимум ${Math.round(mime.maxSize / 1024 / 1024)} МБ)` };
  }

  const dir = path.join(STORAGE_ROOT, String(existing.competencyId));
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${Date.now()}${mime.ext}`;
  const filePath = path.join(dir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  if (existing.filePath) await fs.rm(existing.filePath, { force: true });

  const now = new Date();
  // url теж обнуляємо — файл, що реально є на диску, завжди має пріоритет
  // (знайдений баг: старий url типу "\\сервер\Support\..." лишався в базі
  // від ручного редагування до появи завантаження файлів і "затуляв"
  // клікабельне посилання на щойно завантажений робочий файл).
  await prisma.material.update({
    where: { id: materialId },
    data: { filePath, originalName: file.name, mimeType: file.type, url: null, contentUpdatedAt: now, contentUpdatedById: actorId },
  });

  await logAudit({
    actorId,
    action: "material.contentReplaced",
    entityType: "Material",
    entityId: materialId,
    diff: { oldOriginalName: existing.originalName, newOriginalName: file.name },
  });

  return { ok: true };
}

export async function readMaterialFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

export async function deleteMaterialFile(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true });
}

/**
 * Воркер черги MATERIAL_FILE_DELIVERY_QUEUE (bot/index.ts) — надсилає працівнику
 * матеріал за його запитом у розділі «Навчання»: файл (PDF чи відео) документом,
 * посилання — текстом. Файл читається з диска заново, ніде не кешується. Мовчки
 * виходить, якщо матеріалу чи telegramId людини вже нема.
 */
export async function deliverMaterialFile(personId: number, materialId: number): Promise<void> {
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person?.telegramId) return;

  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) return;

  if (material.filePath) {
    const buffer = await readMaterialFile(material.filePath);
    const fallbackExt = material.type === MaterialType.VIDEO ? ".mp4" : ".pdf";
    await sendTelegramDocument(person.telegramId, buffer, material.originalName ?? `${material.title}${fallbackExt}`, material.title);
  } else if (material.url) {
    await sendTelegramMessage(person.telegramId, `${material.title}
${material.url}`);
  } else {
    await sendTelegramMessage(person.telegramId, `Матеріал «${material.title}» ще не додано — зверніться до адміністратора.`);
  }
}
