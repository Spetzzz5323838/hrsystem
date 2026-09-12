import { promises as fs } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";

let compiledTemplate: HandlebarsTemplateDelegate | null = null;

async function getClearanceSheetTemplate(): Promise<HandlebarsTemplateDelegate> {
  if (!compiledTemplate) {
    const source = await fs.readFile(path.join(process.cwd(), "lib", "pdf", "clearance-sheet.hbs"), "utf-8");
    compiledTemplate = Handlebars.compile(source);
  }
  return compiledTemplate;
}

export type ClearanceSheetTaskRow = {
  order: number;
  title: string;
  responsibleName: string;
  statusLabel: string;
  whenStr: string;
  comment: string;
};

export type ClearanceSheetPdfData = {
  number: string;
  isComplete: boolean;
  fullName: string;
  positionTitle: string;
  objectName: string;
  reasonName: string;
  hiredAtStr: string;
  startedAtStr: string;
  lastWorkingDayStr: string;
  initiatorName: string;
  tasks: ClearanceSheetTaskRow[];
  equipment: { inventoryNo: string; name: string; statusStr: string }[];
  unresolvedItems: string[];
  generatedByName: string;
  generatedAtStr: string;
  hash: string;
};

/** Рендерить HTML (Handlebars) у PDF (Puppeteer). Кожен виклик — окремий
 * headless Chromium: друк листа узгодження рідкісна дія, оптимізація
 * пулу браузерів тут зайва. */
export async function renderClearanceSheetPdf(data: ClearanceSheetPdfData): Promise<Buffer> {
  const template = await getClearanceSheetTemplate();
  const html = template(data);

  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
