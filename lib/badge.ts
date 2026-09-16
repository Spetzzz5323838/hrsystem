import { promises as fs } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import { prisma } from "./prisma";

let compiledTemplate: HandlebarsTemplateDelegate | null = null;

async function getBadgeTemplate(): Promise<HandlebarsTemplateDelegate> {
  if (!compiledTemplate) {
    const source = await fs.readFile(path.join(process.cwd(), "lib", "pdf", "badge.hbs"), "utf-8");
    compiledTemplate = Handlebars.compile(source);
  }
  return compiledTemplate;
}

/**
 * Бейдж-перепустка (docs catalogs-v1.1.md §6.1, п.10 "Видача бейджа,
 * спецодягу, ключів") — фото+ПІБ+посада+об'єкт, БЕЗ жодного штрихкода чи
 * секрету (узгоджено з користувачем 2026-09-16: на відміну від пароля 1С,
 * бейдж — не одноразовий і не відкличний, тож секрету на ньому бути не
 * може). Ніде не зберігається — генерується наживо щоразу, на відміну від
 * листа узгодження (тому й нема окремого номера/audit trail на кожен друк).
 */
export async function generateBadgePdf(employmentId: number): Promise<Buffer | null> {
  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: { person: true, staffUnit: { include: { positionProfile: true, orgNode: true } } },
  });
  if (!employment) return null;

  // Вузький виняток з VIEW_DOCUMENTS (архітектурне рішення №9): PRINT_BADGE
  // читає САМЕ Document(type=PHOTO), гейт уже перевірено на рівні API-роута
  // перед викликом цієї функції — тут просто беремо файл, без повторної
  // перевірки прав на інші типи сканів.
  const photo = await prisma.document.findFirst({
    where: { personId: employment.personId, documentTypeCode: "PHOTO" },
    orderBy: { uploadedAt: "desc" },
  });

  let photoDataUri: string | null = null;
  if (photo) {
    try {
      const bytes = await fs.readFile(photo.filePath);
      photoDataUri = `data:${photo.mimeType};base64,${bytes.toString("base64")}`;
    } catch {
      photoDataUri = null; // файл міг бути прибраний ретеншном — бейдж друкується без фото, не падає
    }
  }

  const template = await getBadgeTemplate();
  const html = template({
    fullName: employment.person.fullName,
    positionTitle: employment.staffUnit.positionProfile.title,
    objectName: employment.staffUnit.orgNode.name,
    photoDataUri,
  });

  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ width: "54mm", height: "86mm", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
