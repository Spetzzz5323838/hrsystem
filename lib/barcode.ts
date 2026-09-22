import bwipjs from "bwip-js/node";

/**
 * Штрихкод Code128 для коду 1С (docs plan-v1.md §8) — генерується на
 * льоту, ніде не зберігається (ні на диску, ні в базі). `includeText:false`
 * — для бейджа-перепустки (правки 20.09.2026, п.4-5): користувач уточнив,
 * що це не секрет входу, а персональний ID-код для обліку робочого часу,
 * тож сам код на бейджі друкується, а цифри під смугами — ні (тільки скан).
 */
export async function generateBarcodePng(value: string, opts?: { includeText?: boolean }): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    scale: 3,
    height: 12,
    includetext: opts?.includeText ?? true,
    textxalign: "center",
  });
}
