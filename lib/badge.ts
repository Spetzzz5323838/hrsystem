import { promises as fs } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import { prisma } from "./prisma";
import { ensureBadgeCode } from "./badgeCode";
import { generateBarcodePng } from "./barcode";

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
 * спецодягу, ключів") — ПІБ+посада+об'єкт+штрихкод коду працівника, БЕЗ
 * фото (правки 20.09.2026, п.5 — фото лишається лише в профілі працівника).
 * Штрихкод — Person.badgeCode (генерує система, 2026-10-18): не секрет,
 * а ID для обліку робочого часу; друкується без видимих цифр під смугами
 * (lib/barcode.ts). Пароль до каси на бейдж НЕ йде.
 * Ніде не зберігається — генерується наживо щоразу, на відміну від
 * листа узгодження (тому й нема окремого номера/audit trail на кожен друк).
 */
export async function generateBadgePdf(employmentId: number): Promise<Buffer | null> {
  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: { person: true, staffUnit: { include: { positionProfile: true, orgNode: true } } },
  });
  if (!employment) return null;

  // Код працівника (не пароль до каси — той секретний і на бейдж не йде,
  // рішення 2026-10-18). ensureBadgeCode — на випадок людини, якій код ще
  // не видали (напр. прийнята до появи генератора).
  const code = await ensureBadgeCode(employment.personId);
  const png = await generateBarcodePng(code, { includeText: false });
  const barcodeDataUri = `data:image/png;base64,${png.toString("base64")}`;

  const template = await getBadgeTemplate();
  const html = template({
    fullName: employment.person.fullName,
    positionTitle: employment.staffUnit.positionProfile.title,
    objectName: employment.staffUnit.orgNode.name,
    barcodeDataUri,
  });

  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    // Повернуто на 90° відносно попередньої версії (86×54мм замість
    // 54×86мм) — щоб штрихкод не спресовувався в суцільну полоску (п.5).
    const pdf = await page.pdf({ width: "86mm", height: "54mm", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
