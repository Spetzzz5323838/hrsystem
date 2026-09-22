import { ChecklistModule } from "../generated/prisma/client";

/**
 * П'ять із дев'яти модулів онбордингу не мають власного прапорця-джерела
 * на PositionProfile — у prisma/seed.ts вони підключались лише за жорстким
 * списком назв посад (RETAIL_TITLES тощо, "немає прапорця-джерела" —
 * свідома прогалина докс). Тут адміністратор перемикає їх вручну.
 */
export const TITLE_BASED_MODULES = [
  ChecklistModule.RETAIL,
  ChecklistModule.WAREHOUSE,
  ChecklistModule.TRANSPORT,
  ChecklistModule.SECURITY,
  ChecklistModule.OFFICE,
] as const;

const TITLE_BASED_SET = new Set<ChecklistModule>(TITLE_BASED_MODULES);

/**
 * Перераховує лише похідні від прапорців/рівня модулі (CASHIER/MVO/FOOD/
 * MANAGEMENT) — той самий принцип, що computeModuleFlags у prisma/seed.ts,
 * але придатний для повторного виклику з UI (створення й редагування
 * посади), не лише при першому засіві. Модулі без прапорця-джерела
 * (TITLE_BASED_MODULES) з існуючого набору зберігаються без змін.
 */
export function recomputeModuleFlags(
  existingModuleFlags: ChecklistModule[],
  input: { requiresCashierAccount: boolean; isMateriallyLiable: boolean; isFoodHandling: boolean; level: number },
): ChecklistModule[] {
  const flags = new Set(existingModuleFlags.filter((m) => TITLE_BASED_SET.has(m)));
  if (input.requiresCashierAccount) flags.add(ChecklistModule.CASHIER);
  if (input.isMateriallyLiable) flags.add(ChecklistModule.MVO);
  if (input.isFoodHandling) flags.add(ChecklistModule.FOOD);
  if (input.level >= 30) flags.add(ChecklistModule.MANAGEMENT);
  return [...flags];
}
