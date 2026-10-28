/**
 * Причини правок табеля (2026-10-28) — без залежностей від бази, щоб імпортувати
 * і на сервері, і в браузері. Значення збігаються з enum TimesheetCorrectionReason.
 */
export const CORRECTION_REASONS = [
  { value: "FORGOT_ARRIVAL", label: "Забув відмітитись на вході" },
  { value: "FORGOT_DEPARTURE", label: "Забув відмітитись на виході" },
  { value: "TERMINAL_FAILURE", label: "Збій терміналу чи зв'язку" },
  { value: "MARKED_BY_MISTAKE", label: "Відмітили помилково (не той бейдж, дубль)" },
  { value: "OFF_TERMINAL_WORK", label: "Робота поза терміналом (виїзд, відрядження)" },
  { value: "OTHER", label: "Інше (опишіть у коментарі)" },
] as const;

export type CorrectionReasonValue = (typeof CORRECTION_REASONS)[number]["value"] | "AUTO_CLOSE";

export const REASON_LABELS: Record<string, string> = {
  ...Object.fromEntries(CORRECTION_REASONS.map((r) => [r.value, r.label])),
  AUTO_CLOSE: "Автозакриття забутої зміни",
};

export const KIND_LABELS: Record<string, string> = {
  EDIT: "Виправлення",
  CREATE: "Додано вручну",
  CANCEL: "Скасовано",
  AUTO_CLOSE: "Автозакриття",
};

/** Скільки правок за місяць вважаємо "частими" (ознака, що не відмічається, або проблема з терміналом). */
export const FREQUENT_CORRECTIONS_THRESHOLD = 3;
