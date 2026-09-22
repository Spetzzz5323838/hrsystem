import { prisma } from "./prisma";
import { saveDocument, readDocumentFile } from "./documents";

/**
 * Аватар профілю (правки 20.09.2026, п.5) — окремий вузький шлях над тим
 * самим Document(type=PHOTO), що раніше показувався лише на бейджі (тепер
 * бейдж фото не містить — лишається лише тут). Гейт перевіряється в
 * API-роуті: читати може той, у кого VIEW_DOCUMENTS АБО PRINT_BADGE
 * (той самий вузький виняток, що раніше застосовувався для бейджа);
 * замінювати — той, у кого UPLOAD_DOCUMENTS. Системний адміністратор не
 * має жодної з цих можливостей (архітектурне рішення №9) — доступу немає.
 */
export async function getLatestAvatarDocument(personId: number) {
  return prisma.document.findFirst({
    where: { personId, documentTypeCode: "PHOTO" },
    orderBy: { uploadedAt: "desc" },
  });
}

export async function readAvatarFile(filePath: string): Promise<Buffer> {
  return readDocumentFile(filePath);
}

export async function saveAvatar(personId: number, uploadedById: number, file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  if (file.type === "application/pdf") return { ok: false, error: "Аватарка має бути зображенням (JPEG/PNG), не PDF" };
  const result = await saveDocument({ personId, documentTypeCode: "PHOTO", uploadedById, file, expiresAt: null });
  if (!result.ok) return result;
  return { ok: true };
}
