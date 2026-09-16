import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";

// Скани — поза `public/`, ніколи не роздаються як статичні файли
// (docs plan-v1.md §14: доступ лише через перевірений роут).
const STORAGE_ROOT = path.join(process.cwd(), "storage", "documents");

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

const MAX_FILE_SIZE = 15 * 1024 * 1024;

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
  if (input.file.size > MAX_FILE_SIZE) return { ok: false, error: "Файл завеликий (максимум 15 МБ)" };

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
