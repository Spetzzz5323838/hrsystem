import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";
import { logAudit } from "./audit";

// Скани — поза `public/`, ніколи не роздаються як статичні файли
// (docs plan-v1.md §14: доступ лише через перевірений роут).
const STORAGE_ROOT = path.join(process.cwd(), "storage", "documents");

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

const MAX_FILE_SIZE = 15 * 1024 * 1024;
// Фото профілю/бейджа — окремий, менший ліміт (правки 20.09.2026, п.6), щоб фото не переповнювали диск сервера.
const MAX_PHOTO_SIZE = 1.1 * 1024 * 1024;

export type SaveDocumentInput = {
  personId: number;
  documentTypeCode: string;
  uploadedById: number;
  file: File;
  expiresAt: Date | null;
};

export async function saveDocument(input: SaveDocumentInput): Promise<{ ok: true; documentId: number } | { ok: false; error: string }> {
  const docType = await prisma.documentType.findUnique({ where: { code: input.documentTypeCode } });
  if (!docType || !docType.isActive) return { ok: false, error: "Невідомий тип документа" };

  const ext = ALLOWED_MIME_TYPES[input.file.type];
  if (!ext) return { ok: false, error: "Дозволені лише PDF, JPEG, PNG" };

  const isPhoto = docType.code === "PHOTO";
  const maxSize = isPhoto ? MAX_PHOTO_SIZE : MAX_FILE_SIZE;
  if (input.file.size > maxSize) {
    return { ok: false, error: isPhoto ? "Фото завелике (максимум 1,1 МБ)" : "Файл завеликий (максимум 15 МБ)" };
  }

  const dir = path.join(STORAGE_ROOT, String(input.personId));
  await fs.mkdir(dir, { recursive: true });

  const fileName = `${Date.now()}_${docType.code}${ext}`;
  const filePath = path.join(dir, fileName);

  const buffer = Buffer.from(await input.file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  const document = await prisma.document.create({
    data: {
      personId: input.personId,
      documentTypeCode: input.documentTypeCode,
      filePath,
      originalName: input.file.name,
      mimeType: input.file.type,
      uploadedById: input.uploadedById,
      expiresAt: input.expiresAt,
    },
  });

  return { ok: true, documentId: document.id };
}

export async function readDocumentFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

export async function deleteDocumentFile(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true });
}

/**
 * Видалення завантаженого документа (правки 20.09.2026, п.9) — щоб
 * бухгалтерія могла виправити, якщо помилково завантажила не той скан.
 * Гейт (UPLOAD_DOCUMENTS) перевіряється в API-роуті до виклику.
 */
export async function deleteDocument(documentId: number, actorId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) return { ok: false, error: "Документ не знайдено" };

  await deleteDocumentFile(document.filePath);
  await prisma.document.delete({ where: { id: documentId } });
  await logAudit({ actorId, action: "document.deleted", entityType: "Document", entityId: documentId, diff: { documentTypeCode: document.documentTypeCode, personId: document.personId } });

  return { ok: true };
}

/**
 * Заміна файлу вже завантаженого документа тим самим типом/строком дії —
 * старий файл видаляється з диска, новий отримує НОВИЙ Document.id (простіше
 * й безпечніше, ніж переписувати filePath на місці існуючого запису).
 */
export async function replaceDocument(documentId: number, file: File, actorId: number): Promise<{ ok: true; documentId: number } | { ok: false; error: string }> {
  const old = await prisma.document.findUnique({ where: { id: documentId } });
  if (!old) return { ok: false, error: "Документ не знайдено" };

  const result = await saveDocument({
    personId: old.personId,
    documentTypeCode: old.documentTypeCode,
    uploadedById: actorId,
    file,
    expiresAt: old.expiresAt,
  });
  if (!result.ok) return result;

  await deleteDocumentFile(old.filePath);
  await prisma.document.delete({ where: { id: documentId } });
  await logAudit({ actorId, action: "document.replaced", entityType: "Document", entityId: result.documentId, diff: { oldDocumentId: documentId, documentTypeCode: old.documentTypeCode } });

  return { ok: true, documentId: result.documentId };
}
