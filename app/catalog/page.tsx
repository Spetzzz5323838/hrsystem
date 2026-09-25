"use client";

import { useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import AppShell from "../components/AppShell";

/** Коротка текстова підказка (правки 20.09.2026, п.2) — нативний title, ховер мишею. */
function Hint({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex cursor-help align-text-top text-slate-400 hover:text-slate-600">
      <HelpCircle size={13} />
    </span>
  );
}

type SortState<T extends string> = { field: T; dir: "asc" | "desc" };

/** Клік по заголовку перемикає сортування (2026-09-25) — той самий стан для будь-якої таблиці "Довідників". */
function toggleSort<T extends string>(current: SortState<T>, field: T): SortState<T> {
  if (current.field === field) return { field, dir: current.dir === "asc" ? "desc" : "asc" };
  return { field, dir: "asc" };
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), "uk");
}

function SortTh<T extends string>({
  label,
  field,
  sort,
  onSort,
  align,
}: {
  label: string;
  field: T;
  sort: SortState<T>;
  onSort: (field: T) => void;
  align?: "right";
}) {
  const active = sort.field === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`cursor-pointer select-none px-4 py-2 font-medium hover:text-slate-800 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        <span className="w-2.5 text-[10px] text-slate-400">{active ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
      </span>
    </th>
  );
}

type ProfileListItem = {
  id: number;
  title: string;
  level: number;
  canBeCurator: boolean;
  requiresCashierAccount: boolean;
  isMateriallyLiable: boolean;
  isFoodHandling: boolean;
  systemRole: string | null;
};

type ProfileDetail = ProfileListItem & {
  moduleFlags: string[];
  isActive: boolean;
  competencies: {
    id: number;
    name: string;
    validMonths: number | null;
    resetOnBreakMonths: number | null;
    materials: { id: number; title: string }[];
    isRequired: boolean;
  }[];
};

type CompetencyRow = {
  id: number;
  code: string;
  name: string;
  category: string | null;
  validMonths: number | null;
  resetOnBreakMonths: number | null;
  isBonus: boolean;
  positionsUsing: number;
};

// Запропоновані категорії для групування компетенцій (2026-09-25) — не
// жорсткий enum, просто список підказок у формі; адмін може вписати й
// свою категорію (select із "своя..." нижче перемикає на текстове поле).
const COMPETENCY_CATEGORIES = [
  "Загальне",
  "Охорона праці й безпека",
  "Санітарія та якість",
  "Торгівля й обслуговування",
  "Каса та матвідповідальність",
  "Виробництво",
];
const UNCATEGORIZED_LABEL = "Без категорії";

type MaterialRow = {
  id: number;
  title: string;
  type: "PDF" | "VIDEO" | "LINK";
  competencyId: number;
  competencyName: string;
  url: string | null;
  hasFile: boolean;
  durationMin: number | null;
  sendViaBot: boolean;
};

// Дзеркалить lib/review.ts::REVIEW_CRITERION_LABELS — той файл тягне за
// собою Prisma-клієнт, тому дублюємо тут, а не імпортуємо в клієнтський компонент.
const REVIEW_CRITERION_LABELS: Record<string, string> = {
  QUALITY: "Якість роботи",
  RELIABILITY: "Надійність",
  PACE: "Темп",
  TEAM: "Команда",
  CLIENT: "Клієнт",
  INITIATIVE: "Ініціатива й розвиток",
};

function Section({ title, right, children }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
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

export default function CatalogPage() {
  const [tab, setTab] = useState<"pos" | "comp" | "mat" | "notif">("pos");
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canEditTemplates, setCanEditTemplates] = useState(false);

  const [profiles, setProfiles] = useState<ProfileListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProfileDetail | null>(null);

  const [competencies, setCompetencies] = useState<CompetencyRow[] | null>(null);
  const [materials, setMaterials] = useState<MaterialRow[] | null>(null);
  const [compSort, setCompSort] = useState<SortState<"name" | "validMonths" | "resetOnBreakMonths" | "positionsUsing">>({
    field: "name",
    dir: "asc",
  });
  const [matSort, setMatSort] = useState<SortState<"title" | "type" | "competencyName" | "sendViaBot">>({ field: "title", dir: "asc" });

  const loadCatalog = () => {
    Promise.all([
      fetch("/api/position-profiles").then((r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "Потрібно увійти в систему" : "Не вдалося завантажити профілі посад");
        return r.json();
      }),
      fetch("/api/competencies").then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити компетенції");
        return r.json();
      }),
      fetch("/api/materials").then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити матеріали");
        return r.json();
      }),
    ])
      .then(([p, c, m]: [ProfileListItem[], CompetencyRow[], MaterialRow[]]) => {
        setProfiles(p);
        setCompetencies(c);
        setMaterials(m);
        setSelectedId((prev) => prev ?? p[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    loadCatalog();
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (!me) return;
        setCanEdit(me.grants.some((g: { capability: string; scope: string }) => g.capability === "MANAGE_MATERIALS" && g.scope === "COMPANY"));
        setCanEditTemplates(me.grants.some((g: { capability: string; scope: string }) => g.capability === "MANAGE_TEMPLATES" && g.scope === "COMPANY"));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDetail = () => {
    if (selectedId == null) return;
    fetch(`/api/position-profiles/${selectedId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити профіль");
        return r.json();
      })
      .then(setDetail)
      .catch((e) => setError(e.message));
  };

  const [newPosTitle, setNewPosTitle] = useState("");
  const [newPosLevel, setNewPosLevel] = useState("10");
  const [posCreating, setPosCreating] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);

  const createPosition = () => {
    if (!newPosTitle.trim()) return;
    setPosCreating(true);
    setPosError(null);
    fetch("/api/position-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newPosTitle.trim(), level: Number(newPosLevel) || 0 }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося створити посаду");
        setNewPosTitle("");
        setNewPosLevel("10");
        setSelectedId(body.id);
        loadCatalog();
      })
      .catch((e) => setPosError(e.message))
      .finally(() => setPosCreating(false));
  };

  const updatePosition = (patch: Record<string, unknown>) => {
    if (selectedId == null) return;
    fetch(`/api/position-profiles/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося зберегти");
        loadDetail();
        loadCatalog();
      })
      .catch((e) => setError(e.message));
  };

  const toggleExtraModule = (module: string, on: boolean) => {
    if (!detail) return;
    const current = new Set(detail.moduleFlags ?? []);
    if (on) current.add(module);
    else current.delete(module);
    updatePosition({ extraModules: [...current] });
  };

  const [reviewWeights, setReviewWeights] = useState<{ criterion: string; weight: number }[] | null>(null);
  const [reviewWeightsError, setReviewWeightsError] = useState<string | null>(null);

  const loadReviewWeights = () => {
    if (selectedId == null) return;
    fetch(`/api/position-profiles/${selectedId}/review-weights`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setReviewWeights)
      .catch(() => setReviewWeights([]));
  };

  const updateReviewWeight = (criterion: string, weight: string) => {
    if (selectedId == null) return;
    const num = Number(weight);
    fetch(`/api/position-profiles/${selectedId}/review-weights`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ criterion, weight: num }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося зберегти вагу");
        setReviewWeightsError(null);
        loadReviewWeights();
      })
      .catch((e) => setReviewWeightsError(e.message));
  };

  useEffect(() => {
    setDetail(null);
    loadDetail();
    setReviewWeights(null);
    loadReviewWeights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── Шаблони сповіщень і журнал відправлень ──
  type NotificationTemplateRow = { id: number; key: string; description: string; text: string };
  type NotificationLogRow = {
    id: number;
    recipientName: string;
    templateKey: string | null;
    text: string;
    status: "QUEUED" | "SENT" | "FAILED";
    error: string | null;
    createdAt: string;
    sentAt: string | null;
  };
  const [notifTemplates, setNotifTemplates] = useState<NotificationTemplateRow[] | null>(null);
  const [notifLog, setNotifLog] = useState<NotificationLogRow[] | null>(null);
  const [notifError, setNotifError] = useState<string | null>(null);

  const loadNotifTemplates = () => {
    fetch("/api/notification-templates")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Не вдалося завантажити шаблони"))))
      .then(setNotifTemplates)
      .catch((e) => setNotifError(e.message));
  };
  const loadNotifLog = () => {
    fetch("/api/notifications?limit=50")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Не вдалося завантажити журнал"))))
      .then(setNotifLog)
      .catch((e) => setNotifError(e.message));
  };

  useEffect(() => {
    if (tab === "notif" && canEditTemplates && !notifTemplates) {
      loadNotifTemplates();
      loadNotifLog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, canEditTemplates]);

  const updateNotifTemplateText = (id: number, text: string) => {
    fetch(`/api/notification-templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося зберегти шаблон");
        setNotifError(null);
      })
      .catch((e) => setNotifError(e.message));
  };

  const NOTIF_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
    SENT: { label: "відправлено", cls: "bg-emerald-50 text-emerald-700" },
    QUEUED: { label: "у черзі", cls: "bg-slate-100 text-slate-600" },
    FAILED: { label: "помилка", cls: "bg-rose-50 text-rose-700" },
  };

  // ── Компетенції: додавання/редагування/видалення ──
  const [compFormOpen, setCompFormOpen] = useState(false);
  const [editingCompId, setEditingCompId] = useState<number | null>(null);
  const [compCode, setCompCode] = useState("");
  const [compName, setCompName] = useState("");
  const [compCategory, setCompCategory] = useState("");
  const [compValidMonths, setCompValidMonths] = useState("");
  const [compResetMonths, setCompResetMonths] = useState("");
  const [compIsBonus, setCompIsBonus] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);
  const [compSubmitting, setCompSubmitting] = useState(false);

  const resetCompForm = () => {
    setCompFormOpen(false);
    setEditingCompId(null);
    setCompCode("");
    setCompName("");
    setCompCategory("");
    setCompValidMonths("");
    setCompResetMonths("");
    setCompIsBonus(false);
    setCompError(null);
  };

  const startEditCompetency = (c: CompetencyRow) => {
    setCompFormOpen(true);
    setEditingCompId(c.id);
    setCompCode(c.code);
    setCompName(c.name);
    setCompCategory(c.category ?? "");
    setCompValidMonths(c.validMonths != null ? String(c.validMonths) : "");
    setCompResetMonths(c.resetOnBreakMonths != null ? String(c.resetOnBreakMonths) : "");
    setCompIsBonus(c.isBonus);
    setCompError(null);
  };

  const submitCompetency = () => {
    setCompSubmitting(true);
    const payload = {
      code: compCode.trim(),
      name: compName.trim(),
      category: compCategory || null,
      validMonths: compValidMonths ? Number(compValidMonths) : null,
      resetOnBreakMonths: compResetMonths ? Number(compResetMonths) : null,
      isBonus: compIsBonus,
    };
    const url = editingCompId ? `/api/competencies/${editingCompId}` : "/api/competencies";
    fetch(url, {
      method: editingCompId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося зберегти компетенцію");
        resetCompForm();
        loadCatalog();
      })
      .catch((e) => setCompError(e.message))
      .finally(() => setCompSubmitting(false));
  };

  const deleteCompetency = (id: number) => {
    if (!confirm("Видалити цю компетенцію з довідника?")) return;
    fetch(`/api/competencies/${id}`, { method: "DELETE" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося видалити");
        loadCatalog();
      })
      .catch((e) => setError(e.message));
  };

  // ── Матеріали: додавання/редагування/видалення ──
  // Правки 2026-09-25: PDF/відео завантажуються файлом на диск сервера
  // (реальне завантаження, не URL) — простіше для нетехнічного користувача.
  // "Посилання" лишається URL-полем для зовнішнього ресурсу.
  const [matFormOpen, setMatFormOpen] = useState(false);
  const [editingMatId, setEditingMatId] = useState<number | null>(null);
  const [matTitle, setMatTitle] = useState("");
  const [matType, setMatType] = useState<"PDF" | "VIDEO" | "LINK">("PDF");
  const [matCompetencyId, setMatCompetencyId] = useState("");
  const [matUrl, setMatUrl] = useState("");
  const [matFile, setMatFile] = useState<File | null>(null);
  const [matHasFile, setMatHasFile] = useState(false);
  const [matDuration, setMatDuration] = useState("");
  const [matSendViaBot, setMatSendViaBot] = useState(false);
  const [matError, setMatError] = useState<string | null>(null);
  const [matSubmitting, setMatSubmitting] = useState(false);

  const resetMatForm = () => {
    setMatFormOpen(false);
    setEditingMatId(null);
    setMatTitle("");
    setMatType("PDF");
    setMatCompetencyId("");
    setMatUrl("");
    setMatFile(null);
    setMatHasFile(false);
    setMatDuration("");
    setMatSendViaBot(false);
    setMatError(null);
  };

  const startEditMaterial = (m: MaterialRow) => {
    setMatFormOpen(true);
    setEditingMatId(m.id);
    setMatTitle(m.title);
    setMatType(m.type);
    setMatCompetencyId(String(m.competencyId));
    setMatUrl(m.url ?? "");
    setMatFile(null);
    setMatHasFile(m.hasFile);
    setMatDuration(m.durationMin != null ? String(m.durationMin) : "");
    setMatSendViaBot(m.sendViaBot);
    setMatError(null);
  };

  const submitMaterial = () => {
    setMatSubmitting(true);
    setMatError(null);
    const endpoint = editingMatId ? `/api/materials/${editingMatId}` : "/api/materials";

    const finish = (promise: Promise<Response>) =>
      promise
        .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
        .then(({ ok, body }) => {
          if (!ok) throw new Error(body.error ?? "Не вдалося зберегти матеріал");
          resetMatForm();
          loadCatalog();
        })
        .catch((e) => setMatError(e.message))
        .finally(() => setMatSubmitting(false));

    if (matType !== "LINK" && matFile) {
      // Завантаження нового файлу (створення) або заміна наявного (редагування).
      const form = new FormData();
      form.append("file", matFile);
      if (!editingMatId) {
        form.append("title", matTitle.trim());
        form.append("type", matType);
        form.append("competencyId", matCompetencyId);
        if (matDuration) form.append("durationMin", matDuration);
        form.append("sendViaBot", String(matSendViaBot));
      }
      finish(fetch(endpoint, { method: editingMatId ? "PATCH" : "POST", body: form }));
      return;
    }

    // Посилання (LINK), або редагування метаданих файлового матеріалу без заміни файлу.
    const payload: Record<string, unknown> = {
      title: matTitle.trim(),
      durationMin: matDuration ? Number(matDuration) : null,
      sendViaBot: matSendViaBot,
      // Тип можна міняти і при редагуванні (правки 20.09.2026, п.9) — контент
      // матеріалу може змінитись з часом. Компетенція лишається незмінною
      // назавжди після створення — щоб не поламати вже пройдені зв'язки
      // навчання-компетенція.
      type: matType,
    };
    if (matType === "LINK") payload.url = matUrl.trim() || null;
    if (!editingMatId) payload.competencyId = Number(matCompetencyId);

    finish(
      fetch(endpoint, {
        method: editingMatId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
  };

  const deleteMaterial = (id: number) => {
    if (!confirm("Видалити цей матеріал?")) return;
    fetch(`/api/materials/${id}`, { method: "DELETE" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося видалити");
        loadCatalog();
      })
      .catch((e) => setError(e.message));
  };

  // ── Навчальний профіль посади: додати/прибрати компетенцію ──
  const [attachCompetencyId, setAttachCompetencyId] = useState("");
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachSubmitting, setAttachSubmitting] = useState(false);

  const attachCompetency = () => {
    if (!selectedId || !attachCompetencyId) return;
    setAttachSubmitting(true);
    fetch(`/api/position-profiles/${selectedId}/competencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competencyId: Number(attachCompetencyId) }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося додати компетенцію");
        setAttachCompetencyId("");
        setAttachError(null);
        loadDetail();
        loadCatalog();
      })
      .catch((e) => setAttachError(e.message))
      .finally(() => setAttachSubmitting(false));
  };

  const detachCompetency = (competencyId: number) => {
    if (!selectedId) return;
    fetch(`/api/position-profiles/${selectedId}/competencies/${competencyId}`, { method: "DELETE" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося прибрати компетенцію");
        loadDetail();
        loadCatalog();
      })
      .catch((e) => setError(e.message));
  };

  /** Обов'язкова/рекомендована — визначає, що входить у поріг допуску на атестації (lib/attestation.ts). */
  const toggleCompetencyRequired = (competencyId: number, isRequired: boolean) => {
    if (!selectedId) return;
    fetch(`/api/position-profiles/${selectedId}/competencies/${competencyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRequired }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося зберегти");
        loadDetail();
      })
      .catch((e) => setError(e.message));
  };

  if (error) {
    return (
      <AppShell active="/catalog">
        <div className="text-sm text-rose-700">{error}</div>
      </AppShell>
    );
  }

  if (!profiles || !competencies || !materials) {
    return (
      <AppShell active="/catalog">
        <div className="text-sm text-slate-500">Завантаження…</div>
      </AppShell>
    );
  }

  return (
    <AppShell active="/catalog">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Довідники</h2>

        <div className="flex gap-1 border-b border-slate-200">
          {(
            [
              ["pos", "Профілі посад"],
              ["comp", "Компетенції"],
              ["mat", "Матеріали"],
              ...(canEditTemplates ? ([["notif", "Сповіщення"]] as const) : ([] as const)),
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                tab === k ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "pos" && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-1">
            <div className="border border-slate-200 bg-white rounded-md p-1">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${
                    selectedId === p.id ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>{p.title}</span>
                  <span className={`text-xs ${selectedId === p.id ? "text-slate-300" : "text-slate-400"}`}>рів. {p.level}</span>
                </button>
              ))}
            </div>

            {canEdit && (
              <div className="border border-slate-200 bg-white rounded-md p-3 space-y-2">
                <p className="text-xs font-medium text-slate-600">+ Створити посаду</p>
                <input
                  type="text"
                  value={newPosTitle}
                  onChange={(e) => setNewPosTitle(e.target.value)}
                  placeholder="Назва посади"
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    Рівень
                    <Hint text="Умовний ранг посади: вищий рівень (≥30) типово означає керівну позицію (додає модуль «Управління» в онбординг). За замовчуванням ні на що більше не впливає — усі права доступу все одно налаштовуються окремо на сторінці «Права доступу»." />
                    <input
                      type="number"
                      value={newPosLevel}
                      onChange={(e) => setNewPosLevel(e.target.value)}
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <button
                    disabled={posCreating || !newPosTitle.trim()}
                    onClick={createPosition}
                    className="ml-auto rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    Створити
                  </button>
                </div>
                {posError && <p className="text-xs text-rose-700">{posError}</p>}
                <p className="text-[11px] text-slate-400">Решту параметрів (Каса, Матвідповідальність тощо) налаштуєте одразу після створення, праворуч.</p>
              </div>
            )}
            </div>

            <div className="space-y-4 lg:col-span-2">
              {detail && (
                <>
                  <Section
                    title={
                      canEdit ? (
                        <input
                          key={detail.id + detail.title}
                          defaultValue={detail.title}
                          onBlur={(e) => e.target.value.trim() && e.target.value !== detail.title && updatePosition({ title: e.target.value.trim() })}
                          className="rounded border border-transparent bg-transparent px-1 py-0.5 font-semibold text-slate-800 hover:border-slate-300 focus:border-slate-400 focus:bg-white"
                        />
                      ) : (
                        detail.title
                      )
                    }
                    right={
                      canEdit && (
                        <button
                          onClick={() => updatePosition({ isActive: !detail.isActive })}
                          className={`rounded border px-2 py-1 text-xs ${detail.isActive ? "border-slate-300 text-slate-600 hover:bg-slate-50" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}
                        >
                          {detail.isActive ? "Архівувати" : "Активувати"}
                        </button>
                      )
                    }
                  >
                    <div className="grid grid-cols-2 gap-4 px-4 py-3 text-sm sm:grid-cols-4">
                      <div>
                        <p className="flex items-center gap-1 text-slate-500">
                          Рівень
                          <Hint text="Умовний ранг посади. Рівень ≥30 автоматично додає модуль «Управління» в онбординг. Права доступу від рівня НЕ залежать — вони налаштовуються окремо на сторінці «Права доступу»." />
                        </p>
                        {canEdit ? (
                          <input
                            key={detail.id + String(detail.level)}
                            type="number"
                            defaultValue={detail.level}
                            onBlur={(e) => Number(e.target.value) !== detail.level && updatePosition({ level: Number(e.target.value) })}
                            className="mt-0.5 w-16 rounded border border-slate-300 px-1.5 py-0.5 text-sm tabular-nums"
                          />
                        ) : (
                          <p className="tabular-nums text-slate-900">{detail.level}</p>
                        )}
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-slate-500">
                          Каса
                          <Hint text="Посада працює з касовим апаратом — додає в онбординг реєстрацію на касі й тест «Каса»." />
                        </p>
                        {canEdit ? (
                          <input
                            type="checkbox"
                            checked={detail.requiresCashierAccount}
                            onChange={(e) => updatePosition({ requiresCashierAccount: e.target.checked })}
                            className="mt-1 h-4 w-4"
                          />
                        ) : (
                          <p className="text-slate-900">{detail.requiresCashierAccount ? "так" : "ні"}</p>
                        )}
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-slate-500">
                          Матвідповідальність
                          <Hint text="Посада матеріально відповідальна (МВО) — додає договір про матвідповідальність в онбординг і пункт передачі ТМЦ при звільненні/переведенні." />
                        </p>
                        {canEdit ? (
                          <input
                            type="checkbox"
                            checked={detail.isMateriallyLiable}
                            onChange={(e) => updatePosition({ isMateriallyLiable: e.target.checked })}
                            className="mt-1 h-4 w-4"
                          />
                        ) : (
                          <p className="text-slate-900">{detail.isMateriallyLiable ? "так" : "ні"}</p>
                        )}
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-slate-500">
                          Харчова група
                          <Hint text="Посада працює з харчовими продуктами — додає в онбординг медкнижку, інструктаж із санітарії/HACCP і тест «Санітарія»." />
                        </p>
                        {canEdit ? (
                          <input
                            type="checkbox"
                            checked={detail.isFoodHandling}
                            onChange={(e) => updatePosition({ isFoodHandling: e.target.checked })}
                            className="mt-1 h-4 w-4"
                          />
                        ) : (
                          <p className="text-slate-900">{detail.isFoodHandling ? "так" : "ні"}</p>
                        )}
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-slate-500">
                          Може бути куратором
                          <Hint text="Людина на цій посаді в принципі може навчати стажерів (загальна ознака посади). Кого САМЕ призначити куратором — вирішує адміністратор об'єкта при онбордингу, з перевіркою її чинних компетенцій." />
                        </p>
                        {canEdit ? (
                          <input
                            type="checkbox"
                            checked={detail.canBeCurator}
                            onChange={(e) => updatePosition({ canBeCurator: e.target.checked })}
                            className="mt-1 h-4 w-4"
                          />
                        ) : (
                          <p className="text-slate-900">{detail.canBeCurator ? "так" : "ні"}</p>
                        )}
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-slate-500">
                          Функціональна роль
                          <Hint text="Наскрізна роль поза рівневою ієрархією (бухгалтер, оператор 1С, ревізор, керівництво, сисадмін) — дає доступ до окремих функцій системи незалежно від об'єкта. Порожньо — звичайна лінійна/керівна посада без такої ролі." />
                        </p>
                        {canEdit ? (
                          <select
                            value={detail.systemRole ?? ""}
                            onChange={(e) => updatePosition({ systemRole: e.target.value || null })}
                            className="mt-0.5 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
                          >
                            <option value="">—</option>
                            {["ONEC_ADMIN", "ACCOUNTANT", "AUDITOR", "COO", "SYSADMIN"].map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-slate-900">{detail.systemRole ?? "—"}</p>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-slate-100 px-4 py-3">
                      <p className="flex items-center gap-1 text-sm text-slate-500">
                        Додаткові модулі онбордингу
                        <Hint text="Ці п'ять модулів (роздріб/склад/транспорт/охорона/офіс) не мають окремого прапорця вище — вмикайте вручну, якщо посаді потрібне відповідне навчання." />
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-3 text-sm">
                        {[
                          ["RETAIL", "Роздріб"],
                          ["WAREHOUSE", "Склад"],
                          ["TRANSPORT", "Транспорт"],
                          ["SECURITY", "Охорона"],
                          ["OFFICE", "Офіс"],
                        ].map(([code, label]) => (
                          <label key={code} className="flex items-center gap-1.5 text-slate-700">
                            <input
                              type="checkbox"
                              disabled={!canEdit}
                              checked={detail.moduleFlags?.includes(code) ?? false}
                              onChange={(e) => toggleExtraModule(code, e.target.checked)}
                              className="h-4 w-4"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </Section>

                  <Section title="Навчальний профіль" right={<span className="text-sm text-slate-500">{detail.competencies.length} компетенцій</span>}>
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="px-4 py-2 font-medium">Компетенція</th>
                          <th className="px-4 py-2 font-medium">Строк дії</th>
                          <th className="px-4 py-2 font-medium">Обнулення при перерві</th>
                          <th className="px-4 py-2 font-medium text-right">Матеріали</th>
                          <th className="px-4 py-2 font-medium text-center">Обов&rsquo;язкова</th>
                          {canEdit && <th className="px-4 py-2" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.competencies.map((c) => (
                          <tr key={c.id}>
                            <td className="px-4 py-2 text-slate-800">{c.name}</td>
                            <td className="px-4 py-2 text-slate-600">{c.validMonths ? `${c.validMonths} міс` : "безстроково"}</td>
                            <td className="px-4 py-2 text-slate-600">{c.resetOnBreakMonths ? `${c.resetOnBreakMonths} міс` : "—"}</td>
                            <td className="px-4 py-2 text-right text-slate-500">
                              {c.materials.length ? `${c.materials.length} матеріал(и)` : "—"}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {canEdit ? (
                                <input
                                  type="checkbox"
                                  checked={c.isRequired}
                                  onChange={(e) => toggleCompetencyRequired(c.id, e.target.checked)}
                                  className="h-4 w-4"
                                />
                              ) : (
                                <span>{c.isRequired ? "так" : "рекомендована"}</span>
                              )}
                            </td>
                            {canEdit && (
                              <td className="px-4 py-2 text-right">
                                <button onClick={() => detachCompetency(c.id)} className="text-xs text-rose-600 hover:text-rose-800">
                                  прибрати
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        {!detail.competencies.length && (
                          <tr>
                            <td colSpan={canEdit ? 6 : 5} className="px-4 py-8 text-center text-sm text-slate-500">
                              У цього профілю ще немає компетенцій у довіднику.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
                      Обов&rsquo;язкові компетенції блокують допуск до роботи на атестації; рекомендовані оцінюються, але не блокують.
                    </p>
                    {canEdit && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3">
                        <select
                          value={attachCompetencyId}
                          onChange={(e) => setAttachCompetencyId(e.target.value)}
                          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">— додати компетенцію —</option>
                          {(competencies ?? [])
                            .filter((c) => !detail.competencies.some((dc) => dc.id === c.id))
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={attachCompetency}
                          disabled={!attachCompetencyId || attachSubmitting}
                          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          Додати
                        </button>
                        {attachError && <span className="text-sm text-rose-700">{attachError}</span>}
                      </div>
                    )}
                  </Section>

                  <Section title="Ваги критеріїв квартальної оцінки">
                    {reviewWeightsError && <p className="px-4 pt-3 text-sm text-rose-700">{reviewWeightsError}</p>}
                    {!reviewWeights ? (
                      <div className="px-4 py-8 text-center text-sm text-slate-500">Завантаження…</div>
                    ) : (
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                          {reviewWeights.map((w) => (
                            <tr key={w.criterion}>
                              <td className="px-4 py-2 text-slate-700">{REVIEW_CRITERION_LABELS[w.criterion] ?? w.criterion}</td>
                              <td className="px-4 py-2 text-right">
                                {canEditTemplates ? (
                                  <input
                                    key={w.criterion + w.weight}
                                    type="number"
                                    min={1}
                                    max={10}
                                    defaultValue={w.weight}
                                    onBlur={(e) => updateReviewWeight(w.criterion, e.target.value)}
                                    className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                                  />
                                ) : (
                                  <span className="text-slate-600">{w.weight}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <p className="px-4 pb-3 pt-1 text-xs text-slate-400">
                      Без налаштування всі критерії важать порівну (вага 1). Вищий бал — більший вплив критерію на підсумкову оцінку.
                    </p>
                  </Section>
                </>
              )}
            </div>
          </div>
        )}

        {tab === "comp" && (
          <Section
            title="Компетенції"
            right={
              canEdit && (
                <button onClick={() => (compFormOpen ? resetCompForm() : setCompFormOpen(true))} className="text-sm text-slate-600 hover:text-slate-900">
                  {compFormOpen ? "Скасувати" : "+ Додати компетенцію"}
                </button>
              )
            }
          >
            {compFormOpen && (
              <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <input
                    value={compCode}
                    onChange={(e) => setCompCode(e.target.value)}
                    placeholder="Код (напр. FIRE_SAFETY)"
                    disabled={!!editingCompId}
                    className="w-56 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
                  />
                  <input
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    placeholder="Назва"
                    className="w-64 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={compCategory}
                    onChange={(e) => setCompCategory(e.target.value)}
                    placeholder="Категорія (для групування)"
                    list="comp-categories"
                    className="w-52 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <datalist id="comp-categories">
                    {COMPETENCY_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                  <input
                    value={compValidMonths}
                    onChange={(e) => setCompValidMonths(e.target.value)}
                    placeholder="Строк дії, міс"
                    type="number"
                    className="w-36 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={compResetMonths}
                    onChange={(e) => setCompResetMonths(e.target.value)}
                    placeholder="Обнулення, міс"
                    type="number"
                    className="w-36 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <label className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input type="checkbox" checked={compIsBonus} onChange={(e) => setCompIsBonus(e.target.checked)} />
                    бонусна
                  </label>
                </div>
                {compError && <p className="text-sm text-rose-700">{compError}</p>}
                <button
                  onClick={submitCompetency}
                  disabled={!compCode.trim() || !compName.trim() || compSubmitting}
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {editingCompId ? "Зберегти" : "Створити"}
                </button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <SortTh label="Назва" field="name" sort={compSort} onSort={(f) => setCompSort((s) => toggleSort(s, f))} />
                  <SortTh label="Строк дії" field="validMonths" sort={compSort} onSort={(f) => setCompSort((s) => toggleSort(s, f))} />
                  <SortTh label="Обнулення" field="resetOnBreakMonths" sort={compSort} onSort={(f) => setCompSort((s) => toggleSort(s, f))} />
                  <th className="px-4 py-2 font-medium">Тип</th>
                  <SortTh
                    label="Посад використовують"
                    field="positionsUsing"
                    sort={compSort}
                    onSort={(f) => setCompSort((s) => toggleSort(s, f))}
                    align="right"
                  />
                  {canEdit && <th className="px-4 py-2" />}
                </tr>
              </thead>
              {(() => {
                // Групування по категоріях (2026-09-25) — запропоновані категорії
                // йдуть першими у фіксованому порядку, довільні (вписані вручну)
                // — за абеткою, "Без категорії" завжди останньою.
                const groups = new Map<string, CompetencyRow[]>();
                for (const c of competencies) {
                  const key = c.category ?? UNCATEGORIZED_LABEL;
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(c);
                }
                const customKeys = [...groups.keys()]
                  .filter((k) => !COMPETENCY_CATEGORIES.includes(k) && k !== UNCATEGORIZED_LABEL)
                  .sort((a, b) => a.localeCompare(b, "uk"));
                const orderedKeys = [
                  ...COMPETENCY_CATEGORIES.filter((cat) => groups.has(cat)),
                  ...customKeys,
                  ...(groups.has(UNCATEGORIZED_LABEL) ? [UNCATEGORIZED_LABEL] : []),
                ];

                return orderedKeys.map((category) => {
                  const rows = [...groups.get(category)!].sort(
                    (a, b) => (compSort.dir === "asc" ? 1 : -1) * compareValues(a[compSort.field], b[compSort.field]),
                  );
                  return (
                    <tbody key={category} className="divide-y divide-slate-100">
                      <tr className="bg-slate-50/70">
                        <td colSpan={canEdit ? 6 : 5} className="px-4 py-1.5 text-xs font-semibold text-slate-500">
                          {category} <span className="font-normal text-slate-400">({rows.length})</span>
                        </td>
                      </tr>
                      {rows.map((c) => (
                        <tr key={c.id}>
                          <td className="px-4 py-2 text-slate-800">{c.name}</td>
                          <td className="px-4 py-2 text-slate-600">{c.validMonths ? `${c.validMonths} міс` : "безстроково"}</td>
                          <td className="px-4 py-2 text-slate-600">{c.resetOnBreakMonths ? `${c.resetOnBreakMonths} міс` : "—"}</td>
                          <td className="px-4 py-2">
                            {c.isBonus ? (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">бонусна</span>
                            ) : (
                              <span className="text-xs text-slate-400">обов&rsquo;язкова</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-600">{c.positionsUsing}</td>
                          {canEdit && (
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end gap-2">
                                <button onClick={() => startEditCompetency(c)} className="text-xs text-slate-600 hover:text-slate-900">
                                  редагувати
                                </button>
                                <button onClick={() => deleteCompetency(c.id)} className="text-xs text-rose-600 hover:text-rose-800">
                                  видалити
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  );
                });
              })()}
            </table>
          </Section>
        )}

        {tab === "mat" && (
          <Section
            title="Навчальні матеріали"
            right={
              canEdit && (
                <button onClick={() => (matFormOpen ? resetMatForm() : setMatFormOpen(true))} className="text-sm text-slate-600 hover:text-slate-900">
                  {matFormOpen ? "Скасувати" : "+ Додати матеріал"}
                </button>
              )
            }
          >
            {matFormOpen && (
              <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <input
                    value={matTitle}
                    onChange={(e) => setMatTitle(e.target.value)}
                    placeholder="Назва матеріалу"
                    className="w-64 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <select
                    value={matType}
                    onChange={(e) => setMatType(e.target.value as "PDF" | "VIDEO" | "LINK")}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="PDF">PDF</option>
                    <option value="VIDEO">Відео</option>
                    <option value="LINK">Посилання</option>
                  </select>
                  <select
                    value={matCompetencyId}
                    onChange={(e) => setMatCompetencyId(e.target.value)}
                    disabled={!!editingMatId}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
                  >
                    <option value="">— компетенція —</option>
                    {competencies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {matType === "LINK" ? (
                    <input
                      value={matUrl}
                      onChange={(e) => setMatUrl(e.target.value)}
                      placeholder="Посилання на матеріал (https://...)"
                      className="w-64 rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  ) : (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="file"
                        accept={matType === "PDF" ? "application/pdf" : "video/mp4,video/webm,video/quicktime"}
                        onChange={(e) => setMatFile(e.target.files?.[0] ?? null)}
                        className="text-sm"
                      />
                      {matHasFile && !matFile && <span className="text-xs text-slate-400">файл уже є — обери новий, щоб замінити</span>}
                    </label>
                  )}
                  <input
                    value={matDuration}
                    onChange={(e) => setMatDuration(e.target.value)}
                    placeholder="Тривалість, хв"
                    type="number"
                    className="w-36 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  {matType !== "VIDEO" && (
                    <label className="flex items-center gap-1.5 text-sm text-slate-700">
                      <input type="checkbox" checked={matSendViaBot} onChange={(e) => setMatSendViaBot(e.target.checked)} />
                      надсилати ботом
                    </label>
                  )}
                </div>
                {matType === "VIDEO" && (
                  <p className="text-xs text-slate-400">Відео надсилається лише через кабінет/інтранет, не через бот.</p>
                )}
                {matError && <p className="text-sm text-rose-700">{matError}</p>}
                <button
                  onClick={submitMaterial}
                  disabled={
                    !matTitle.trim() ||
                    (!editingMatId && !matCompetencyId) ||
                    (matType !== "LINK" && !editingMatId && !matFile) ||
                    matSubmitting
                  }
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {editingMatId ? "Зберегти" : "Створити"}
                </button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <SortTh label="Матеріал" field="title" sort={matSort} onSort={(f) => setMatSort((s) => toggleSort(s, f))} />
                  <SortTh label="Тип" field="type" sort={matSort} onSort={(f) => setMatSort((s) => toggleSort(s, f))} />
                  <SortTh label="Компетенція" field="competencyName" sort={matSort} onSort={(f) => setMatSort((s) => toggleSort(s, f))} />
                  <SortTh label="Канал" field="sendViaBot" sort={matSort} onSort={(f) => setMatSort((s) => toggleSort(s, f))} align="right" />
                  {canEdit && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...materials]
                  .sort((a, b) => (matSort.dir === "asc" ? 1 : -1) * compareValues(a[matSort.field], b[matSort.field]))
                  .map((m) => {
                  // Завантажений файл важливіший за url — деякі старі матеріали мають
                  // застарілий url (напр. мережевий шлях, набраний до появи
                  // завантаження файлу), який браузер відкрити не може.
                  const href = m.hasFile ? `/api/materials/${m.id}/file` : m.url;
                  return (
                  <tr key={m.id}>
                    <td className="px-4 py-2 text-slate-800">
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer" className="text-slate-800 underline underline-offset-2 hover:text-slate-900">
                          {m.title}
                        </a>
                      ) : (
                        m.title
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{m.type === "PDF" ? "PDF" : m.type === "VIDEO" ? "Відео" : "Посилання"}</td>
                    <td className="px-4 py-2 text-slate-600">{m.competencyName}</td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          m.sendViaBot ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {m.sendViaBot ? "бот" : "intranet"}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => startEditMaterial(m)} className="text-xs text-slate-600 hover:text-slate-900">
                            редагувати
                          </button>
                          <button onClick={() => deleteMaterial(m.id)} className="text-xs text-rose-600 hover:text-rose-800">
                            видалити
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>
        )}

        {tab === "notif" && canEditTemplates && (
          <div className="space-y-4">
            {notifError && <p className="text-sm text-rose-700">{notifError}</p>}

            <Section title="Шаблони сповіщень" right={<span className="text-xs text-slate-500">{notifTemplates?.length ?? 0} шаблонів</span>}>
              {!notifTemplates && <p className="px-4 py-6 text-sm text-slate-500">Завантаження…</p>}
              {notifTemplates && (
                <div className="divide-y divide-slate-100">
                  {notifTemplates.map((t) => (
                    <div key={t.id} className="px-4 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">{t.description}</p>
                        <code className="shrink-0 text-xs text-slate-400">{t.key}</code>
                      </div>
                      <textarea
                        key={t.id}
                        defaultValue={t.text}
                        rows={3}
                        onBlur={(e) => e.target.value !== t.text && updateNotifTemplateText(t.id, e.target.value)}
                        className="mt-1.5 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs focus:border-slate-800 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Журнал відправлень" right={<span className="text-xs text-slate-500">останні {notifLog?.length ?? 0}</span>}>
              {!notifLog && <p className="px-4 py-6 text-sm text-slate-500">Завантаження…</p>}
              {notifLog && !notifLog.length && <p className="px-4 py-6 text-sm text-slate-500">Ще нічого не надсилалось.</p>}
              {notifLog && !!notifLog.length && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="px-4 py-2 text-left font-medium">Кому</th>
                      <th className="px-3 py-2 text-left font-medium">Шаблон</th>
                      <th className="px-3 py-2 text-left font-medium">Текст</th>
                      <th className="px-3 py-2 text-left font-medium">Статус</th>
                      <th className="px-3 py-2 text-right font-medium">Коли</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {notifLog.map((n) => {
                      const meta = NOTIF_STATUS_LABELS[n.status] ?? { label: n.status, cls: "bg-slate-100 text-slate-600" };
                      return (
                        <tr key={n.id}>
                          <td className="px-4 py-2 text-slate-700">{n.recipientName}</td>
                          <td className="px-3 py-2 text-slate-500">{n.templateKey ?? "—"}</td>
                          <td className="max-w-xs truncate px-3 py-2 text-slate-500" title={n.text}>
                            {n.text}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`rounded px-1.5 py-0.5 font-medium ${meta.cls}`} title={n.error ?? undefined}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-slate-400">
                            {new Date(n.sentAt ?? n.createdAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
