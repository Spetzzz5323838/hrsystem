import bwipjs from "bwip-js/node";

/**
 * Штрихкод Code128 для пароля 1С (docs plan-v1.md §8) — генерується на
 * льоту в момент відправки, ніде не зберігається (ні на диску, ні в базі).
 */
export async function generateBarcodePng(value: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    scale: 3,
    height: 12,
    includetext: true,
    textxalign: "center",
  });
}
