"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Award, Check, Clock, Eye, Lock, Phone, Star, ThumbsDown, ThumbsUp, X } from "lucide-react";

type CompetencyRow = {
  competencyId: number;
  name: string;
  validMonths: number | null;
  state: "valid" | "expired" | "missing";
  passedAt: string | null;
  validUntil: string | null;
};

type Detail = {
  employmentId: number;
  fullName: string;
  phone: string;
  birthDate: string | null;
  positionTitle: string;
  objectName: string;
  status: string;
  hiredAt: string | null;
  terminatedAt: string | null;
  curatorName: string | null;
  competencies: CompetencyRow[];
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  REGISTERED: { label: "Зареєстрований", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  ACTIVATED: { label: "Активовано", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  DOCUMENTS_PENDING: { label: "Оформлення", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  TRAINEE: { label: "Стажер", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  READY_FOR_ATTESTATION: { label: "На атестацію", cls: "bg-amber-100 text-amber-900 border-amber-400" },
  ACTIVE: { label: "Працює", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  TERMINATION_STARTED: { label: "Звільняється", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  TERMINATED: { label: "Звільнений", cls: "bg-slate-100 text-slate-500 border-slate-300" },
};

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Працівник",
  CURATOR: "Куратор",
  STORE_ADMIN: "Адміністратор",
  ONEC_ADMIN: "Оператор 1С",
  ACCOUNTANT: "Бухгалтер",
  AUDITOR: "Ревізор",
  COO: "Керівництво",
  SYSADMIN: "Системний адміністратор",
};

function roleLabel(role: string | null): string {
  if (!role) return "Система";
  return ROLE_LABELS[role] ?? role;
}

const AVATAR_BG = ["bg-slate-700", "bg-teal-700", "bg-indigo-700", "bg-amber-700", "bg-rose-700", "bg-emerald-700"];

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const parts = name.split(" ");
  const ini = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  const bg = AVATAR_BG[name.length % AVATAR_BG.length];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-medium text-white ${bg}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {ini}
    </span>
  );
}

function Badge({ status }: { status: string }) {
  const meta = STATUS_LABELS[status] ?? { label: status, cls: "bg-slate-100 text-slate-700 border-slate-300" };
  return <span className={`inline-flex items-center border px-2 py-0.5 text-xs font-medium rounded ${meta.cls}`}>{meta.label}</span>;
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 bg-white rounded-md">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "transfer.started": "Ініційовано переведення",
  "transfer.staffUnitChanged": "Змінено штатну одиницю (переведення)",
  "transfer.completed": "Переведення завершено",
  "employment.frozen": "Заморожено",
  "employment.unfrozen": "Розморожено",
  "termination.started": "Ініційовано звільнення",
  "termination.completed": "Звільнення завершено",
  "curator.assigned": "Призначено куратора",
};

function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

type TaskRow = {
  taskId: number;
  order: number;
  title: string;
  responsibleRole: string | null;
  actionType: "MARK" | "UPLOAD" | "INPUT_VALUE" | "TEST" | "APPROVAL" | "AUTO";
  module: string | null;
  isBlocking: boolean;
  status: "PENDING" | "DONE";
  blocked: boolean;
  overdue: boolean;
  assigneeId: number | null;
  assigneeName: string | null;
  dueAt: string | null;
  completedAt: string | null;
};

type OnboardingData = {
  instance: { id: number; state: string; startedAt: string; finishedAt: string | null } | null;
  tasks: TaskRow[];
};

const ACTION_LABEL: Record<string, string> = {
  APPROVAL: "Погодити",
  INPUT_VALUE: "Внести значення",
  UPLOAD: "Завантажити",
  TEST: "Позначити складеним",
};

function Checklist({
  tasks,
  myEmploymentIds,
  onToggle,
  busyTaskId,
}: {
  tasks: TaskRow[];
  myEmploymentIds: number[];
  onToggle: (taskId: number) => void;
  busyTaskId: number | null;
}) {
  const firstOpen = tasks.findIndex((t) => t.status !== "DONE" && t.isBlocking);

  return (
    <ol className="divide-y divide-slate-100">
      {tasks.map((t, i) => {
        const done = t.status === "DONE";
        const isNext = i === firstOpen;
        const mine = t.assigneeId != null && myEmploymentIds.includes(t.assigneeId);

        return (
          <li key={t.taskId} className={`flex gap-3 px-4 py-3 ${isNext ? "bg-amber-50" : ""}`}>
            <div className="flex flex-col items-center pt-0.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-white ${
                  done ? "bg-emerald-600 border-emerald-600" : isNext ? "bg-amber-500 border-amber-500" : "bg-white border-slate-300"
                }`}
              >
                {done && <Check size={12} strokeWidth={3} />}
                {!done && isNext && <Clock size={12} strokeWidth={3} />}
                {!done && t.blocked && <Lock size={10} className="text-slate-400" />}
              </span>
              {i < tasks.length - 1 && <span className={`w-px flex-1 mt-1 ${done ? "bg-emerald-300" : "bg-slate-200"}`} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm ${done ? "text-slate-500 line-through" : "text-slate-900"}`}>{t.title}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 border border-slate-200">
                  {roleLabel(t.responsibleRole)}
                </span>
                {t.overdue && (
                  <span className="rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700 border border-rose-200">протерміновано</span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {done ? `Виконано ${fmtDateTime(t.completedAt)}` : t.dueAt ? `Норматив до ${fmtDateTime(t.dueAt)}` : "Автоматично"}
              </p>
            </div>
            <div className="shrink-0">
              {!done &&
                t.responsibleRole !== null &&
                (mine && !t.blocked ? (
                  <button
                    disabled={busyTaskId === t.taskId}
                    onClick={() => onToggle(t.taskId)}
                    className="rounded border border-slate-800 bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {ACTION_LABEL[t.actionType] ?? "Виконано"}
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">
                    {t.blocked ? "Очікує попередній крок" : t.assigneeName ? `Виконує ${t.assigneeName}` : "Виконавця не призначено"}
                  </span>
                ))}
              {done && <Check size={16} className="text-emerald-600" />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const TABS = [
  ["process", "Онбординг"],
  ["transfer", "Переведення"],
  ["termination", "Звільнення"],
  ["comp", "Компетенції"],
  ["docs", "Документи"],
  ["rating", "Рейтинг"],
  ["equip", "Обладнання"],
  ["hist", "Історія"],
] as const;

type TabKey = (typeof TABS)[number][0];

type RatingCategoryRow = { code: string; name: string; side: "POS" | "NEG" };
type BadgeCatalogRow = { code: string; name: string; description: string; isAuto: boolean };

type RatingEventRow = {
  id: number;
  type: "POSITIVE" | "NEGATIVE" | "REPRIMAND" | "AWARD" | "AUTO";
  categoryName: string | null;
  points: number;
  comment: string | null;
  visibility: "PRIVATE" | "EMPLOYEE" | "PUBLIC";
  authorId: number;
  authorName: string;
  occurredAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
};

type BadgeAwardRow = {
  code: string;
  name: string;
  description: string;
  isAuto: boolean;
  awardedAt: string;
  awardedByName: string | null;
  comment: string | null;
};

type RatingData = {
  score: number;
  level: { name: string; min: number };
  nextLevel: { name: string; min: number } | null;
  events: RatingEventRow[];
  badges: BadgeAwardRow[];
};

const RATING_TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  POSITIVE: { label: "Позитив", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  NEGATIVE: { label: "Негатив", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  AWARD: { label: "Номінація", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  REPRIMAND: { label: "Догана", cls: "bg-rose-100 text-rose-900 border-rose-400" },
  AUTO: { label: "Система", cls: "bg-slate-100 text-slate-600 border-slate-300" },
};

type DialogSide = "POSITIVE" | "NEGATIVE" | "REPRIMAND" | "AWARD";

function CuratorDialog({
  candidates,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  candidates: { employmentId: number; fullName: string; positionTitle: string }[];
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (curatorEmploymentId: number) => void;
}) {
  const [selected, setSelected] = useState("");

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-md rounded-md bg-white p-5">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Призначити куратора</h3>
          <button onClick={onClose}>
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <label className="mt-4 block">
          <span className="text-sm text-slate-700">Куратор</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">— оберіть —</option>
            {candidates.map((c) => (
              <option key={c.employmentId} value={c.employmentId}>
                {c.fullName} · {c.positionTitle}
              </option>
            ))}
          </select>
          {!candidates.length && <p className="mt-1 text-xs text-slate-400">На цьому об&rsquo;єкті немає нікого з прапорцем «може бути куратором».</p>}
        </label>

        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Скасувати
          </button>
          <button
            disabled={submitting || !selected}
            onClick={() => onSubmit(Number(selected))}
            className={`rounded px-3 py-1.5 text-sm font-medium text-white ${
              submitting || !selected ? "cursor-not-allowed bg-slate-300" : "bg-slate-800 hover:bg-slate-700"
            }`}
          >
            Призначити
          </button>
        </div>
      </div>
    </div>
  );
}

function FreezeDialog({
  reasons,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  reasons: { code: string; name: string }[];
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: { reasonCode: string; plannedReturnAt: string; vacatesPosition: boolean }) => void;
}) {
  const [reasonCode, setReasonCode] = useState("");
  const [plannedReturnAt, setPlannedReturnAt] = useState("");
  const [vacatesPosition, setVacatesPosition] = useState(false);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-md rounded-md bg-white p-5">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Заморозити працівника</h3>
          <button onClick={onClose}>
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <label className="mt-4 block">
          <span className="text-sm text-slate-700">Причина</span>
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">— оберіть —</option>
            {reasons.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="text-sm text-slate-700">Планована дата повернення</span>
          <input
            type="date"
            value={plannedReturnAt}
            onChange={(e) => setPlannedReturnAt(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={vacatesPosition} onChange={(e) => setVacatesPosition(e.target.checked)} />
          Звільнити штатну одиницю на час заморозки (можна взяти заміну)
        </label>

        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Скасувати
          </button>
          <button
            disabled={submitting || !reasonCode}
            onClick={() => onSubmit({ reasonCode, plannedReturnAt, vacatesPosition })}
            className={`rounded px-3 py-1.5 text-sm font-medium text-white ${
              submitting || !reasonCode ? "cursor-not-allowed bg-slate-300" : "bg-cyan-600 hover:bg-cyan-700"
            }`}
          >
            Заморозити
          </button>
        </div>
      </div>
    </div>
  );
}

function RateDialog({
  side,
  categories,
  badges,
  onClose,
  onSubmit,
  submitting,
  error,
  needsConfirmation,
}: {
  side: DialogSide;
  categories: RatingCategoryRow[];
  badges: BadgeCatalogRow[];
  onClose: () => void;
  onSubmit: (payload: { categoryCode?: string; badgeCode?: string; comment: string; confirmedConversation: boolean }) => void;
  submitting: boolean;
  error: string | null;
  needsConfirmation: boolean;
}) {
  const [categoryCode, setCategoryCode] = useState("");
  const [badgeCode, setBadgeCode] = useState("");
  const [comment, setComment] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const isAward = side === "AWARD";
  const isReprimand = side === "REPRIMAND";
  const isCategorySide = side === "POSITIVE" || side === "NEGATIVE";
  const sideLabel = isAward ? "Номінація" : isReprimand ? "Догана" : side === "NEGATIVE" ? "Зафіксувати негатив" : "Зафіксувати позитив";
  const relevantCategories = categories.filter((c) => c.side === (side === "POSITIVE" ? "POS" : "NEG"));
  const nominationBadges = badges.filter((b) => !b.isAuto);

  const commentRequired = side === "NEGATIVE" || isAward || isReprimand;
  const canSubmit =
    !submitting &&
    comment.trim().length >= (commentRequired ? 3 : 0) &&
    (!isCategorySide || categoryCode) &&
    (!isAward || badgeCode) &&
    (!needsConfirmation || confirmed);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-md bg-white p-5">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{sideLabel}</h3>
          <button onClick={onClose}>
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {isAward && (
          <label className="mt-4 block">
            <span className="text-sm text-slate-700">Нагорода</span>
            <select
              value={badgeCode}
              onChange={(e) => setBadgeCode(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">— оберіть —</option>
              {nominationBadges.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {isCategorySide && (
          <div className="mt-4">
            <p className="text-sm text-slate-700">Привід</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {relevantCategories.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setCategoryCode(c.code)}
                  className={`rounded border px-2.5 py-1 text-sm ${
                    categoryCode === c.code
                      ? side === "NEGATIVE"
                        ? "border-rose-400 bg-rose-50 text-rose-800"
                        : "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="mt-4 block">
          <span className="text-sm text-slate-700">
            Коментар {commentRequired && <span className="text-rose-600">обов&rsquo;язковий</span>}
          </span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm placeholder-slate-400 focus:border-slate-800 focus:outline-none"
          />
        </label>

        {needsConfirmation && (
          <label className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
            Це вже третій негатив цьому працівнику за тиждень. Підтверджую, що особиста бесіда з ним відбулася.
          </label>
        )}

        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Скасувати
          </button>
          <button
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({ categoryCode: categoryCode || undefined, badgeCode: badgeCode || undefined, comment, confirmedConversation: confirmed })
            }
            className={`rounded px-3 py-1.5 text-sm font-medium text-white ${
              !canSubmit ? "cursor-not-allowed bg-slate-300" : "bg-slate-800 hover:bg-slate-700"
            }`}
          >
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmployeeCardClient({ employmentId }: { employmentId: string }) {
  const [tab, setTab] = useState<TabKey>("process");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [myEmploymentIds, setMyEmploymentIds] = useState<number[]>([]);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  const loadDetail = () => {
    fetch(`/api/employees/${employmentId}`)
      .then((r) => {
        if (!r.ok) {
          if (r.status === 401) throw new Error("Потрібно увійти в систему");
          if (r.status === 403) throw new Error("Немає доступу до цього працівника");
          if (r.status === 404) throw new Error("Працівника не знайдено");
          throw new Error("Не вдалося завантажити картку");
        }
        return r.json();
      })
      .then(setDetail)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    loadDetail();

    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setMyEmploymentIds(me?.employmentIds ?? []))
      .catch(() => {});

    fetch("/api/freeze-reasons")
      .then((r) => (r.ok ? r.json() : []))
      .then(setFreezeReasons)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employmentId]);

  const [freezeDialogOpen, setFreezeDialogOpen] = useState(false);
  const [freezeReasons, setFreezeReasons] = useState<{ code: string; name: string }[]>([]);
  const [freezing, setFreezing] = useState(false);
  const [unfreezing, setUnfreezing] = useState(false);
  const [freezeError, setFreezeError] = useState<string | null>(null);
  const [unfreezeResult, setUnfreezeResult] = useState<{ extendedCompetencies: number; frozenDays: number } | null>(null);

  const submitFreeze = (payload: { reasonCode: string; plannedReturnAt: string; vacatesPosition: boolean }) => {
    setFreezing(true);
    fetch(`/api/employees/${employmentId}/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося заморозити");
        setFreezeDialogOpen(false);
        setFreezeError(null);
        loadDetail();
      })
      .catch((e) => setFreezeError(e.message))
      .finally(() => setFreezing(false));
  };

  const unfreeze = () => {
    setUnfreezing(true);
    fetch(`/api/employees/${employmentId}/freeze`, { method: "DELETE" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося розморозити");
        setUnfreezeResult({ extendedCompetencies: body.extendedCompetencies, frozenDays: body.frozenDays });
        setFreezeError(null);
        loadDetail();
      })
      .catch((e) => setFreezeError(e.message))
      .finally(() => setUnfreezing(false));
  };

  const loadOnboarding = () => {
    fetch(`/api/employees/${employmentId}/onboarding`)
      .then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити онбординг");
        return r.json();
      })
      .then((data) => {
        setOnboarding(data);
        setOnboardingError(null);
      })
      .catch((e) => setOnboardingError(e.message));
  };

  useEffect(() => {
    loadOnboarding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employmentId]);

  const startOnboarding = () => {
    setStarting(true);
    fetch(`/api/employees/${employmentId}/onboarding`, { method: "POST" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося запустити онбординг");
        setOnboarding(body);
        setOnboardingError(null);
      })
      .catch((e) => setOnboardingError(e.message))
      .finally(() => setStarting(false));
  };

  const [curatorDialogTaskId, setCuratorDialogTaskId] = useState<number | null>(null);
  const [curatorCandidates, setCuratorCandidates] = useState<{ employmentId: number; fullName: string; positionTitle: string }[]>([]);
  const [curatorError, setCuratorError] = useState<string | null>(null);
  const [curatorSubmitting, setCuratorSubmitting] = useState(false);

  const completeTask = (taskId: number) => {
    const task = onboarding?.tasks.find((t) => t.taskId === taskId);
    if (task?.title === "Призначення куратора") {
      setCuratorError(null);
      setCuratorDialogTaskId(taskId);
      fetch(`/api/employees/${employmentId}/curator-candidates`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setCuratorCandidates)
        .catch(() => setCuratorCandidates([]));
      return;
    }

    setBusyTaskId(taskId);
    fetch(`/api/tasks/${taskId}/complete`, { method: "POST" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося виконати задачу");
        loadOnboarding();
      })
      .catch((e) => setOnboardingError(e.message))
      .finally(() => setBusyTaskId(null));
  };

  const submitCurator = (curatorEmploymentId: number) => {
    if (!curatorDialogTaskId) return;
    setCuratorSubmitting(true);
    fetch(`/api/tasks/${curatorDialogTaskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ curatorEmploymentId }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося призначити куратора");
        setCuratorDialogTaskId(null);
        loadOnboarding();
        loadDetail();
      })
      .catch((e) => setCuratorError(e.message))
      .finally(() => setCuratorSubmitting(false));
  };

  // ── Переведення ──
  const [transferData, setTransferData] = useState<OnboardingData | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [staffUnits, setStaffUnits] = useState<{ id: number; positionTitle: string; objectName: string }[]>([]);
  const [targetStaffUnitId, setTargetStaffUnitId] = useState("");
  const [transferStarting, setTransferStarting] = useState(false);
  const [transferBusyTaskId, setTransferBusyTaskId] = useState<number | null>(null);

  const loadTransfer = () => {
    fetch(`/api/employees/${employmentId}/transfer`)
      .then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити переведення");
        return r.json();
      })
      .then((data) => {
        setTransferData(data);
        setTransferError(null);
      })
      .catch((e) => setTransferError(e.message));
  };

  useEffect(() => {
    loadTransfer();
    fetch("/api/staff-units")
      .then((r) => (r.ok ? r.json() : []))
      .then(setStaffUnits)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employmentId]);

  const startTransferAction = () => {
    if (!targetStaffUnitId) return;
    setTransferStarting(true);
    fetch(`/api/employees/${employmentId}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetStaffUnitId: Number(targetStaffUnitId) }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося ініціювати переведення");
        setTransferData({ instance: { id: body.instanceId, state: "RUNNING", startedAt: new Date().toISOString(), finishedAt: null }, tasks: body.tasks });
        setTransferError(null);
      })
      .catch((e) => setTransferError(e.message))
      .finally(() => setTransferStarting(false));
  };

  const completeTransferTaskClick = (taskId: number) => {
    setTransferBusyTaskId(taskId);
    fetch(`/api/tasks/${taskId}/complete`, { method: "POST" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося виконати задачу");
        loadTransfer();
        loadDetail();
      })
      .catch((e) => setTransferError(e.message))
      .finally(() => setTransferBusyTaskId(null));
  };

  // ── Звільнення ──
  const [terminationData, setTerminationData] = useState<OnboardingData | null>(null);
  const [terminationError, setTerminationError] = useState<string | null>(null);
  const [terminationReasons, setTerminationReasons] = useState<{ code: string; name: string }[]>([]);
  const [terminationReasonCode, setTerminationReasonCode] = useState("");
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [terminationStarting, setTerminationStarting] = useState(false);
  const [terminationBusyTaskId, setTerminationBusyTaskId] = useState<number | null>(null);
  const [clearanceSheet, setClearanceSheet] = useState<{ number: string; isComplete: boolean; generatedAt: string } | null>(null);
  const [clearanceSheetGenerating, setClearanceSheetGenerating] = useState(false);

  const loadTermination = () => {
    fetch(`/api/employees/${employmentId}/termination`)
      .then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити звільнення");
        return r.json();
      })
      .then((data) => {
        setTerminationData(data);
        setTerminationError(null);
      })
      .catch((e) => setTerminationError(e.message));
  };

  useEffect(() => {
    loadTermination();
    fetch("/api/termination-reasons")
      .then((r) => (r.ok ? r.json() : []))
      .then(setTerminationReasons)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employmentId]);

  const startTerminationAction = () => {
    if (!terminationReasonCode || !lastWorkingDay) return;
    setTerminationStarting(true);
    fetch(`/api/employees/${employmentId}/termination`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasonCode: terminationReasonCode, lastWorkingDay }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося ініціювати звільнення");
        setTerminationData({ instance: { id: body.instanceId, state: "RUNNING", startedAt: new Date().toISOString(), finishedAt: null }, tasks: body.tasks });
        setTerminationError(null);
        loadDetail();
      })
      .catch((e) => setTerminationError(e.message))
      .finally(() => setTerminationStarting(false));
  };

  const completeTerminationTaskClick = (taskId: number) => {
    setTerminationBusyTaskId(taskId);
    fetch(`/api/tasks/${taskId}/complete`, { method: "POST" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося виконати задачу");
        loadTermination();
        loadDetail();
      })
      .catch((e) => setTerminationError(e.message))
      .finally(() => setTerminationBusyTaskId(null));
  };

  const printClearanceSheet = () => {
    setClearanceSheetGenerating(true);
    fetch(`/api/employees/${employmentId}/clearance-sheet`, { method: "POST" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося сформувати лист");
        setClearanceSheet(body);
        setTerminationError(null);
      })
      .catch((e) => setTerminationError(e.message))
      .finally(() => setClearanceSheetGenerating(false));
  };

  // ── Документи ──
  const [documents, setDocuments] = useState<
    { id: number; documentTypeName: string; originalName: string; uploadedByName: string; uploadedAt: string; expiresAt: string | null }[] | null
  >(null);
  const [documentsForbidden, setDocumentsForbidden] = useState(false);
  const [documentTypes, setDocumentTypes] = useState<{ code: string; name: string }[]>([]);
  const [uploadTypeCode, setUploadTypeCode] = useState("");
  const [uploadExpiresAt, setUploadExpiresAt] = useState("");
  const [uploadFile, setUploadFile] = useState<globalThis.File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const loadDocuments = () => {
    fetch(`/api/employees/${employmentId}/documents`)
      .then((r) => {
        if (r.status === 403) {
          setDocumentsForbidden(true);
          return null;
        }
        if (!r.ok) throw new Error("Не вдалося завантажити документи");
        setDocumentsForbidden(false);
        return r.json();
      })
      .then((data) => {
        if (data) setDocuments(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadDocuments();
    fetch("/api/document-types")
      .then((r) => (r.ok ? r.json() : []))
      .then(setDocumentTypes)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employmentId]);

  const submitDocument = () => {
    if (!uploadFile || !uploadTypeCode) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", uploadFile);
    form.append("documentTypeCode", uploadTypeCode);
    if (uploadExpiresAt) form.append("expiresAt", uploadExpiresAt);

    fetch(`/api/employees/${employmentId}/documents`, { method: "POST", body: form })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося завантажити");
        setUploadFile(null);
        setUploadTypeCode("");
        setUploadExpiresAt("");
        setUploadError(null);
        loadDocuments();
      })
      .catch((e) => setUploadError(e.message))
      .finally(() => setUploading(false));
  };

  // ── Обладнання ──
  const [equipment, setEquipment] = useState<{ id: number; inventoryNo: string; name: string; assignedAt: string | null }[] | null>(null);
  const [newEquipmentInventoryNo, setNewEquipmentInventoryNo] = useState("");
  const [newEquipmentName, setNewEquipmentName] = useState("");
  const [equipmentSubmitting, setEquipmentSubmitting] = useState(false);
  const [equipmentError, setEquipmentError] = useState<string | null>(null);

  const loadEquipment = () => {
    fetch(`/api/employees/${employmentId}/equipment`)
      .then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити обладнання");
        return r.json();
      })
      .then(setEquipment)
      .catch(() => {});
  };

  useEffect(() => {
    loadEquipment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employmentId]);

  const submitEquipment = () => {
    setEquipmentSubmitting(true);
    fetch(`/api/employees/${employmentId}/equipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inventoryNo: newEquipmentInventoryNo.trim(), name: newEquipmentName.trim() }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося закріпити обладнання");
        setNewEquipmentInventoryNo("");
        setNewEquipmentName("");
        setEquipmentError(null);
        loadEquipment();
      })
      .catch((e) => setEquipmentError(e.message))
      .finally(() => setEquipmentSubmitting(false));
  };

  const clearEquipmentClick = (equipmentId: number) => {
    fetch(`/api/equipment/${equipmentId}/clear`, { method: "POST" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося зняти обладнання");
        loadEquipment();
      })
      .catch((e) => setEquipmentError(e.message));
  };

  const [history, setHistory] = useState<
    { id: number; action: string; diff: unknown; actorName: string | null; createdAt: string }[] | null
  >(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/employees/${employmentId}/audit-log`)
      .then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити історію");
        return r.json();
      })
      .then((data) => {
        setHistory(data.entries);
        setHistoryError(null);
      })
      .catch((e) => setHistoryError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employmentId]);

  const [rating, setRating] = useState<RatingData | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [categories, setCategories] = useState<RatingCategoryRow[]>([]);
  const [badgeCatalog, setBadgeCatalog] = useState<BadgeCatalogRow[]>([]);
  const [dialogSide, setDialogSide] = useState<DialogSide | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogNeedsConfirmation, setDialogNeedsConfirmation] = useState(false);
  const [dialogSubmitting, setDialogSubmitting] = useState(false);

  const loadRating = () => {
    fetch(`/api/employees/${employmentId}/rating`)
      .then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити рейтинг");
        return r.json();
      })
      .then((data) => {
        setRating(data);
        setRatingError(null);
      })
      .catch((e) => setRatingError(e.message));
  };

  useEffect(() => {
    loadRating();
    fetch("/api/rating-categories")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCategories)
      .catch(() => {});
    fetch("/api/badges")
      .then((r) => (r.ok ? r.json() : []))
      .then(setBadgeCatalog)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employmentId]);

  const submitRating = (payload: { categoryCode?: string; badgeCode?: string; comment: string; confirmedConversation: boolean }) => {
    if (!dialogSide) return;
    setDialogSubmitting(true);
    fetch(`/api/employees/${employmentId}/rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: dialogSide, ...payload }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) {
          setDialogError(body.error ?? "Не вдалося зберегти");
          setDialogNeedsConfirmation(Boolean(body.needsConversationConfirmation));
          return;
        }
        setDialogSide(null);
        setDialogError(null);
        setDialogNeedsConfirmation(false);
        loadRating();
      })
      .catch(() => setDialogError("Не вдалося зберегти"))
      .finally(() => setDialogSubmitting(false));
  };

  const cancelRatingEventClick = (eventId: number) => {
    const reason = window.prompt("Причина скасування:");
    if (reason == null) return;
    fetch(`/api/rating-events/${eventId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося скасувати");
        loadRating();
      })
      .catch((e) => setRatingError(e.message));
  };

  if (error) {
    return <div className="px-6 py-6 text-sm text-rose-700">{error}</div>;
  }

  if (!detail) {
    return <div className="px-6 py-6 text-sm text-slate-500">Завантаження…</div>;
  }

  const gapsCount = detail.competencies.filter((c) => c.state !== "valid").length;

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-6">
      <div className="space-y-4">
        <Link href="/employees" className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft size={15} /> До списку
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4 border border-slate-200 bg-white rounded-md p-4">
          <div className="flex gap-4">
            <Avatar name={detail.fullName} size={56} />
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold text-slate-900">{detail.fullName}</h2>
                <Badge status={detail.status} />
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {detail.positionTitle} · {detail.objectName}
              </p>
              <p className="mt-0.5 flex items-center gap-3 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <Phone size={12} /> {detail.phone}
                </span>
                {detail.birthDate && <span>нар. {fmtDate(detail.birthDate)}</span>}
                <span>{detail.terminatedAt ? `звільнений ${fmtDate(detail.terminatedAt)}` : `прийнятий ${fmtDate(detail.hiredAt)}`}</span>
              </p>
              {detail.curatorName && <p className="mt-0.5 text-sm text-slate-500">Куратор: {detail.curatorName}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.status === "ACTIVE" && (
              <button
                onClick={() => setFreezeDialogOpen(true)}
                className="rounded border border-cyan-300 px-3 py-1.5 text-sm font-medium text-cyan-700 hover:bg-cyan-50"
              >
                Заморозити
              </button>
            )}
            {detail.status === "FROZEN" && (
              <button
                onClick={unfreeze}
                disabled={unfreezing}
                className="rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                Розморозити
              </button>
            )}
          </div>
        </div>

        {freezeError && <p className="text-sm text-rose-700">{freezeError}</p>}
        {unfreezeResult && (
          <p className="rounded border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
            Розморожено · строк дії {unfreezeResult.extendedCompetencies} компетенцій продовжено на {unfreezeResult.frozenDays} дн.
          </p>
        )}

        {freezeDialogOpen && (
          <FreezeDialog
            reasons={freezeReasons}
            submitting={freezing}
            error={freezeError}
            onClose={() => {
              setFreezeDialogOpen(false);
              setFreezeError(null);
            }}
            onSubmit={submitFreeze}
          />
        )}

        <div className="flex flex-wrap gap-1 border-b border-slate-200">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                tab === k ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "process" && (
          <>
            {onboardingError && <p className="text-sm text-rose-700">{onboardingError}</p>}
            {!onboarding ? (
              <div className="border border-dashed border-slate-300 bg-white rounded-md px-6 py-12 text-center text-sm text-slate-500">
                Завантаження…
              </div>
            ) : !onboarding.instance ? (
              <div className="border border-dashed border-slate-300 bg-white rounded-md px-6 py-12 text-center">
                <p className="text-sm text-slate-600">Онбординг ще не запущено.</p>
                <button
                  onClick={startOnboarding}
                  disabled={starting}
                  className="mt-3 rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Запустити онбординг
                </button>
              </div>
            ) : (
              <Section
                title="Чек-ліст онбордингу"
                right={
                  <span className="tabular-nums text-sm text-slate-500">
                    {onboarding.tasks.filter((t) => t.status === "DONE").length} з {onboarding.tasks.length}
                    {onboarding.instance.state === "DONE" && " · завершено"}
                  </span>
                }
              >
                <Checklist tasks={onboarding.tasks} myEmploymentIds={myEmploymentIds} onToggle={completeTask} busyTaskId={busyTaskId} />
              </Section>
            )}
            {curatorDialogTaskId && (
              <CuratorDialog
                candidates={curatorCandidates}
                submitting={curatorSubmitting}
                error={curatorError}
                onClose={() => setCuratorDialogTaskId(null)}
                onSubmit={submitCurator}
              />
            )}
          </>
        )}

        {tab === "transfer" && (
          <>
            {transferError && <p className="text-sm text-rose-700">{transferError}</p>}
            {!transferData ? (
              <div className="border border-dashed border-slate-300 bg-white rounded-md px-6 py-12 text-center text-sm text-slate-500">
                Завантаження…
              </div>
            ) : !transferData.instance ? (
              detail.status === "ACTIVE" ? (
                <div className="border border-slate-200 bg-white rounded-md p-5">
                  <h3 className="text-sm font-semibold text-slate-800">Ініціювати переведення</h3>
                  <label className="mt-3 block">
                    <span className="text-sm text-slate-700">Нове місце й посада</span>
                    <select
                      value={targetStaffUnitId}
                      onChange={(e) => setTargetStaffUnitId(e.target.value)}
                      className="mt-1 w-full max-w-md rounded border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">— оберіть —</option>
                      {staffUnits
                        .filter((su) => `${su.positionTitle}@${su.objectName}` !== `${detail.positionTitle}@${detail.objectName}`)
                        .map((su) => (
                          <option key={su.id} value={su.id}>
                            {su.positionTitle} · {su.objectName}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    onClick={startTransferAction}
                    disabled={transferStarting || !targetStaffUnitId}
                    className="mt-3 rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    Ініціювати переведення
                  </button>
                </div>
              ) : (
                <div className="border border-dashed border-slate-300 bg-white rounded-md px-6 py-12 text-center text-sm text-slate-500">
                  Переведення доступне тільки для активного працівника.
                </div>
              )
            ) : (
              <Section
                title="Чек-ліст переведення"
                right={
                  <span className="tabular-nums text-sm text-slate-500">
                    {transferData.tasks.filter((t) => t.status === "DONE").length} з {transferData.tasks.length}
                    {transferData.instance.state === "DONE" && " · завершено"}
                  </span>
                }
              >
                <Checklist
                  tasks={transferData.tasks}
                  myEmploymentIds={myEmploymentIds}
                  onToggle={completeTransferTaskClick}
                  busyTaskId={transferBusyTaskId}
                />
              </Section>
            )}
          </>
        )}

        {tab === "termination" && (
          <div className="space-y-4">
            {terminationError && <p className="text-sm text-rose-700">{terminationError}</p>}
            {!terminationData ? (
              <div className="border border-dashed border-slate-300 bg-white rounded-md px-6 py-12 text-center text-sm text-slate-500">
                Завантаження…
              </div>
            ) : !terminationData.instance ? (
              detail.status === "ACTIVE" ? (
                <div className="border border-slate-200 bg-white rounded-md p-5">
                  <h3 className="text-sm font-semibold text-slate-800">Ініціювати звільнення</h3>
                  <label className="mt-3 block">
                    <span className="text-sm text-slate-700">Причина</span>
                    <select
                      value={terminationReasonCode}
                      onChange={(e) => setTerminationReasonCode(e.target.value)}
                      className="mt-1 w-full max-w-md rounded border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">— оберіть —</option>
                      {terminationReasons.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-3 block">
                    <span className="text-sm text-slate-700">Останній робочий день</span>
                    <input
                      type="date"
                      value={lastWorkingDay}
                      onChange={(e) => setLastWorkingDay(e.target.value)}
                      className="mt-1 w-full max-w-md rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <button
                    onClick={startTerminationAction}
                    disabled={terminationStarting || !terminationReasonCode || !lastWorkingDay}
                    className="mt-3 rounded border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Ініціювати звільнення
                  </button>
                </div>
              ) : (
                <div className="border border-dashed border-slate-300 bg-white rounded-md px-6 py-12 text-center text-sm text-slate-500">
                  Звільнення доступне тільки для активного працівника.
                </div>
              )
            ) : (
              <>
                <Section
                  title="Чек-ліст звільнення"
                  right={
                    <span className="tabular-nums text-sm text-slate-500">
                      {terminationData.tasks.filter((t) => t.status === "DONE").length} з {terminationData.tasks.length}
                      {terminationData.instance.state === "DONE" && " · завершено"}
                    </span>
                  }
                >
                  <Checklist
                    tasks={terminationData.tasks}
                    myEmploymentIds={myEmploymentIds}
                    onToggle={completeTerminationTaskClick}
                    busyTaskId={terminationBusyTaskId}
                  />
                </Section>

                <div className="flex flex-wrap items-center gap-3 border border-slate-200 bg-white rounded-md p-4">
                  <button
                    onClick={printClearanceSheet}
                    disabled={clearanceSheetGenerating}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Друкувати лист узгодження
                  </button>
                  {clearanceSheet && (
                    <span className="text-sm text-slate-600">
                      № {clearanceSheet.number} ·{" "}
                      {clearanceSheet.isComplete ? (
                        <span className="text-emerald-700">усі обов&rsquo;язкові пункти закрито</span>
                      ) : (
                        <span className="text-amber-700">ПОПЕРЕДНІЙ — процедуру не завершено</span>
                      )}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "comp" && (
          <Section
            title={`Компетенції за профілем «${detail.positionTitle}»`}
            right={
              <span className="text-sm text-slate-500">
                {detail.competencies.length === 0
                  ? "профілю ще немає в довіднику компетенцій"
                  : gapsCount === 0
                    ? "профіль закрито повністю"
                    : `дельта: ${gapsCount}`}
              </span>
            }
          >
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Компетенція</th>
                  <th className="px-4 py-2 font-medium">Складено</th>
                  <th className="px-4 py-2 font-medium">Дійсна до</th>
                  <th className="px-4 py-2 font-medium text-right">Стан</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.competencies.map((c) => (
                  <tr key={c.competencyId}>
                    <td className="px-4 py-2 text-slate-800">{c.name}</td>
                    <td className="px-4 py-2 tabular-nums text-slate-500">{fmtDate(c.passedAt)}</td>
                    <td className="px-4 py-2 tabular-nums text-slate-500">
                      {c.passedAt ? (c.validUntil ? fmtDate(c.validUntil) : "безстроково") : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {c.state === "valid" && (
                        <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">чинна</span>
                      )}
                      {c.state === "expired" && (
                        <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">строк вийшов</span>
                      )}
                      {c.state === "missing" && (
                        <span className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-600">немає</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!detail.competencies.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                      Для цього профілю посади ще не задано жодної компетенції.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>
        )}

        {tab === "docs" && (
          <div className="space-y-4">
            <Section title="Завантажити документ">
              <div className="flex flex-wrap items-end gap-2 px-4 py-3">
                <label className="block">
                  <span className="text-xs text-slate-500">Тип документа</span>
                  <select
                    value={uploadTypeCode}
                    onChange={(e) => setUploadTypeCode(e.target.value)}
                    className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">— оберіть —</option>
                    {documentTypes.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-slate-500">Дійсний до (якщо є строк)</span>
                  <input
                    type="date"
                    value={uploadExpiresAt}
                    onChange={(e) => setUploadExpiresAt(e.target.value)}
                    className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-500">Файл (PDF/JPEG/PNG)</span>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    className="mt-1 block text-sm"
                  />
                </label>
                <button
                  onClick={submitDocument}
                  disabled={uploading || !uploadFile || !uploadTypeCode}
                  className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Завантажити
                </button>
              </div>
              {uploadError && <p className="px-4 pb-3 text-sm text-rose-700">{uploadError}</p>}
            </Section>

            <Section title="Документи">
              {documentsForbidden ? (
                <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
                  <Lock size={15} /> Скани доступні бухгалтерії та керівництву.
                </div>
              ) : !documents ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">Завантаження…</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Тип</th>
                      <th className="px-4 py-2 font-medium">Файл</th>
                      <th className="px-4 py-2 font-medium">Завантажив</th>
                      <th className="px-4 py-2 font-medium">Дійсний до</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {documents.map((d) => (
                      <tr key={d.id}>
                        <td className="px-4 py-2.5 text-slate-800">{d.documentTypeName}</td>
                        <td className="px-4 py-2.5 text-slate-600">{d.originalName}</td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {d.uploadedByName} · {fmtDate(d.uploadedAt)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {d.expiresAt && (
                            <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                              до {fmtDate(d.expiresAt)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <a
                            href={`/api/documents/${d.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-800"
                          >
                            переглянути
                          </a>
                        </td>
                      </tr>
                    ))}
                    {!documents.length && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                          Документів ще немає.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </Section>
          </div>
        )}

        {tab === "rating" && (
          <div className="space-y-4">
            {ratingError && <p className="text-sm text-rose-700">{ratingError}</p>}
            {!rating ? (
              <div className="border border-dashed border-slate-300 bg-white rounded-md px-6 py-12 text-center text-sm text-slate-500">
                Завантаження…
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 border border-slate-200 bg-white rounded-md p-3">
                  <button
                    onClick={() => setDialogSide("POSITIVE")}
                    className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    <ThumbsUp size={14} /> Позитив
                  </button>
                  <button
                    onClick={() => setDialogSide("NEGATIVE")}
                    className="flex items-center gap-1.5 rounded border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
                  >
                    <ThumbsDown size={14} /> Негатив
                  </button>
                  <button
                    onClick={() => setDialogSide("AWARD")}
                    className="flex items-center gap-1.5 rounded border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50"
                  >
                    <Award size={14} /> Номінація
                  </button>
                  <button
                    onClick={() => setDialogSide("REPRIMAND")}
                    className="flex items-center gap-1.5 rounded border border-rose-400 px-3 py-1.5 text-sm font-medium text-rose-900 hover:bg-rose-50"
                  >
                    Догана
                  </button>
                  <div className="ml-auto flex items-center gap-4 text-sm">
                    <span className="text-slate-500">
                      Рівень: <span className="font-medium text-slate-900">{rating.level.name}</span>
                    </span>
                    <span className="text-slate-500">
                      Бал (12 міс): <span className="tabular-nums font-semibold text-slate-900">{rating.score}</span>
                    </span>
                    {rating.nextLevel && (
                      <span className="text-xs text-slate-400">
                        до «{rating.nextLevel.name}» — {rating.nextLevel.min - rating.score}
                      </span>
                    )}
                  </div>
                </div>

                <Section title="Журнал оцінювання" right={<span className="text-xs text-slate-500">{rating.events.length} записів</span>}>
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Дата</th>
                        <th className="px-4 py-2 font-medium">Тип</th>
                        <th className="px-4 py-2 font-medium">Привід</th>
                        <th className="px-4 py-2 font-medium text-right">Бали</th>
                        <th className="px-4 py-2 font-medium">Коментар</th>
                        <th className="px-4 py-2 font-medium">Автор</th>
                        <th className="px-4 py-2 font-medium text-center">Видимість</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rating.events.map((e) => {
                        const meta = RATING_TYPE_LABEL[e.type];
                        const canCancel = !e.cancelledAt && myEmploymentIds.includes(e.authorId);
                        const hoursSince = (Date.now() - new Date(e.occurredAt).getTime()) / (1000 * 60 * 60);
                        return (
                          <tr key={e.id} className={e.cancelledAt ? "opacity-40" : ""}>
                            <td className="px-4 py-2 tabular-nums text-slate-500">{fmtDate(e.occurredAt)}</td>
                            <td className="px-4 py-2">
                              <span className={`rounded border px-1.5 py-0.5 text-xs ${meta.cls}`}>{meta.label}</span>
                            </td>
                            <td className="px-4 py-2 text-slate-700">{e.categoryName ?? "—"}</td>
                            <td className={`px-4 py-2 text-right tabular-nums font-medium ${e.points < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                              {e.points > 0 ? `+${e.points}` : e.points}
                            </td>
                            <td className="px-4 py-2 text-slate-600">
                              {e.comment}
                              {e.cancelledAt && <span className="ml-1 text-xs text-slate-400">(скасовано: {e.cancelReason})</span>}
                            </td>
                            <td className="px-4 py-2 text-slate-500">{e.authorName}</td>
                            <td className="px-4 py-2 text-center">
                              {e.visibility === "PRIVATE" && (
                                <span title="Тільки керівники">
                                  <Lock size={13} className="mx-auto text-slate-400" />
                                </span>
                              )}
                              {e.visibility === "EMPLOYEE" && (
                                <span title="Видно працівнику">
                                  <Eye size={13} className="mx-auto text-slate-500" />
                                </span>
                              )}
                              {e.visibility === "PUBLIC" && (
                                <span title="Видно всім">
                                  <Star size={13} className="mx-auto text-amber-500" />
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {canCancel && hoursSince <= 48 && (
                                <button
                                  onClick={() => cancelRatingEventClick(e.id)}
                                  className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-700"
                                >
                                  скасувати
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!rating.events.length && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                            Записів ще немає.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </Section>

                <Section title="Досягнення" right={<span className="text-xs text-slate-500">видно колегам</span>}>
                  <div className="px-4 py-3">
                    {rating.badges.length ? (
                      <div className="space-y-2">
                        {rating.badges.map((b) => (
                          <div key={b.code} className="flex items-start gap-3 rounded border border-slate-200 px-3 py-2">
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                b.isAuto ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {b.isAuto ? <Check size={15} /> : <Award size={15} />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900">{b.name}</p>
                              <p className="text-xs text-slate-500">
                                {b.comment || b.description} · {fmtDate(b.awardedAt)}
                              </p>
                              {b.awardedByName && <p className="text-xs text-slate-400">нагородив {b.awardedByName}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Досягнень ще немає.</p>
                    )}
                  </div>
                </Section>
              </>
            )}

            {dialogSide && (
              <RateDialog
                side={dialogSide}
                categories={categories}
                badges={badgeCatalog}
                submitting={dialogSubmitting}
                error={dialogError}
                needsConfirmation={dialogNeedsConfirmation}
                onClose={() => {
                  setDialogSide(null);
                  setDialogError(null);
                  setDialogNeedsConfirmation(false);
                }}
                onSubmit={submitRating}
              />
            )}
          </div>
        )}

        {tab === "equip" && (
          <div className="space-y-4">
            <Section title="Закріпити нове">
              <div className="flex flex-wrap items-end gap-2 px-4 py-3">
                <label className="block">
                  <span className="text-xs text-slate-500">Інвентарний номер</span>
                  <input
                    value={newEquipmentInventoryNo}
                    onChange={(e) => setNewEquipmentInventoryNo(e.target.value)}
                    className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-500">Назва</span>
                  <input
                    value={newEquipmentName}
                    onChange={(e) => setNewEquipmentName(e.target.value)}
                    className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <button
                  onClick={submitEquipment}
                  disabled={equipmentSubmitting || !newEquipmentInventoryNo.trim() || !newEquipmentName.trim()}
                  className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Закріпити
                </button>
              </div>
              {equipmentError && <p className="px-4 pb-3 text-sm text-rose-700">{equipmentError}</p>}
            </Section>

            <Section title="Закріплене обладнання">
              {!equipment ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">Завантаження…</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {equipment.map((eq) => (
                      <tr key={eq.id}>
                        <td className="px-4 py-2.5 font-mono text-slate-500">{eq.inventoryNo}</td>
                        <td className="px-4 py-2.5 text-slate-800">{eq.name}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => clearEquipmentClick(eq.id)}
                            className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-700"
                          >
                            зняти
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!equipment.length && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">
                          Обладнання не закріплене.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </Section>
          </div>
        )}

        {tab === "hist" && (
          <Section title="Історія">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-2.5 text-slate-500">Прийнятий</td>
                  <td className="px-4 py-2.5 text-slate-900">{fmtDate(detail.hiredAt)}</td>
                </tr>
                {detail.terminatedAt && (
                  <tr>
                    <td className="px-4 py-2.5 text-slate-500">Звільнений</td>
                    <td className="px-4 py-2.5 text-slate-900">{fmtDate(detail.terminatedAt)}</td>
                  </tr>
                )}
                <tr>
                  <td className="px-4 py-2.5 text-slate-500">Поточний статус</td>
                  <td className="px-4 py-2.5 text-slate-900">
                    <Badge status={detail.status} />
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="border-t border-slate-200 px-4 py-3">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Журнал змін</h3>
              {historyError && <p className="text-sm text-red-600">{historyError}</p>}
              {!historyError && history === null && <p className="text-sm text-slate-500">Завантаження…</p>}
              {!historyError && history !== null && history.length === 0 && (
                <p className="text-sm text-slate-500">Ще немає жодного запису.</p>
              )}
              {!historyError && history !== null && history.length > 0 && (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-500">{fmtDateTime(h.createdAt)}</td>
                        <td className="px-2 py-2 text-slate-900">{auditActionLabel(h.action)}</td>
                        <td className="px-2 py-2 text-slate-500">{h.actorName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
