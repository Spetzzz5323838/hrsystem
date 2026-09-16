"use client";

import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";

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
  competencies: {
    id: number;
    name: string;
    validMonths: number | null;
    resetOnBreakMonths: number | null;
    materials: { id: number; title: string }[];
  }[];
};

type CompetencyRow = {
  id: number;
  code: string;
  name: string;
  validMonths: number | null;
  resetOnBreakMonths: number | null;
  isBonus: boolean;
  positionsUsing: number;
};

type MaterialRow = {
  id: number;
  title: string;
  type: "PDF" | "VIDEO" | "LINK";
  competencyId: number;
  competencyName: string;
  url: string | null;
  durationMin: number | null;
  sendViaBot: boolean;
};

type AttestationItemRow = { id: number; order: number; title: string; maxPoints: number };
type AttestationSectionRow = { id: number; order: number; title: string; items: AttestationItemRow[] };
type AttestationForm = { templateId: number; passThresholdPercent: number; maxScore: number; sections: AttestationSectionRow[] };

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

  const [attestationForm, setAttestationForm] = useState<AttestationForm | null>(null);
  const [attestationLoaded, setAttestationLoaded] = useState(false);

  const loadAttestationForm = () => {
    if (selectedId == null) return;
    fetch(`/api/position-profiles/${selectedId}/attestation-template`)
      .then((r) => (r.ok ? r.json() : { form: null }))
      .then((body) => {
        setAttestationForm(body.form);
        setAttestationLoaded(true);
      })
      .catch(() => setAttestationLoaded(true));
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
    setAttestationForm(null);
    setAttestationLoaded(false);
    loadAttestationForm();
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
  const [matFormOpen, setMatFormOpen] = useState(false);
  const [editingMatId, setEditingMatId] = useState<number | null>(null);
  const [matTitle, setMatTitle] = useState("");
  const [matType, setMatType] = useState<"PDF" | "VIDEO" | "LINK">("PDF");
  const [matCompetencyId, setMatCompetencyId] = useState("");
  const [matUrl, setMatUrl] = useState("");
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
    setMatDuration(m.durationMin != null ? String(m.durationMin) : "");
    setMatSendViaBot(m.sendViaBot);
    setMatError(null);
  };

  const submitMaterial = () => {
    setMatSubmitting(true);
    const url = editingMatId ? `/api/materials/${editingMatId}` : "/api/materials";
    const payload: Record<string, unknown> = {
      title: matTitle.trim(),
      url: matUrl.trim() || null,
      durationMin: matDuration ? Number(matDuration) : null,
      sendViaBot: matSendViaBot,
    };
    if (!editingMatId) {
      payload.type = matType;
      payload.competencyId = Number(matCompetencyId);
    }
    fetch(url, {
      method: editingMatId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося зберегти матеріал");
        resetMatForm();
        loadCatalog();
      })
      .catch((e) => setMatError(e.message))
      .finally(() => setMatSubmitting(false));
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

  // ── Конструктор атестації (docs catalogs-v1.1 §7) ──
  const [attestationError, setAttestationError] = useState<string | null>(null);
  const [newThreshold, setNewThreshold] = useState("80");
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newItemBySection, setNewItemBySection] = useState<Record<number, { title: string; maxPoints: string }>>({});

  const createAttestationForm = () => {
    if (!selectedId) return;
    fetch(`/api/position-profiles/${selectedId}/attestation-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passThresholdPercent: Number(newThreshold) }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося створити форму");
        setAttestationError(null);
        loadAttestationForm();
      })
      .catch((e) => setAttestationError(e.message));
  };

  const updateThreshold = (value: string) => {
    if (!selectedId) return;
    fetch(`/api/position-profiles/${selectedId}/attestation-template`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passThresholdPercent: Number(value) }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося зберегти прохідний бал");
        loadAttestationForm();
      })
      .catch((e) => setAttestationError(e.message));
  };

  const deleteAttestationForm = () => {
    if (!selectedId) return;
    if (!confirm("Видалити всю форму атестації для цієї посади (з розділами й пунктами)?")) return;
    fetch(`/api/position-profiles/${selectedId}/attestation-template`, { method: "DELETE" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося видалити форму");
        loadAttestationForm();
      })
      .catch((e) => setAttestationError(e.message));
  };

  const addSection = () => {
    if (!selectedId || !newSectionTitle.trim()) return;
    fetch(`/api/position-profiles/${selectedId}/attestation-template/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSectionTitle.trim() }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося додати розділ");
        setNewSectionTitle("");
        loadAttestationForm();
      })
      .catch((e) => setAttestationError(e.message));
  };

  const renameSection = (sectionId: number, title: string) => {
    if (!title.trim()) return;
    fetch(`/api/attestation-sections/${sectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося перейменувати розділ");
        loadAttestationForm();
      })
      .catch((e) => setAttestationError(e.message));
  };

  const renameItem = (itemId: number, title: string) => {
    if (!title.trim()) return;
    fetch(`/api/attestation-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося перейменувати пункт");
        loadAttestationForm();
      })
      .catch((e) => setAttestationError(e.message));
  };

  const deleteSection = (sectionId: number) => {
    if (!confirm("Видалити розділ і всі його пункти?")) return;
    fetch(`/api/attestation-sections/${sectionId}`, { method: "DELETE" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося видалити розділ");
        loadAttestationForm();
      })
      .catch((e) => setAttestationError(e.message));
  };

  const addItem = (sectionId: number) => {
    const draft = newItemBySection[sectionId];
    if (!draft?.title.trim()) return;
    fetch(`/api/attestation-sections/${sectionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: draft.title.trim(), maxPoints: Number(draft.maxPoints || "2") }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося додати пункт");
        setNewItemBySection((prev) => ({ ...prev, [sectionId]: { title: "", maxPoints: "2" } }));
        loadAttestationForm();
      })
      .catch((e) => setAttestationError(e.message));
  };

  const deleteItem = (itemId: number) => {
    fetch(`/api/attestation-items/${itemId}`, { method: "DELETE" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося видалити пункт");
        loadAttestationForm();
      })
      .catch((e) => setAttestationError(e.message));
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
            <div className="border border-slate-200 bg-white rounded-md p-1 lg:col-span-1">
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

            <div className="space-y-4 lg:col-span-2">
              {detail && (
                <>
                  <Section title={detail.title}>
                    <div className="grid grid-cols-2 gap-4 px-4 py-3 text-sm sm:grid-cols-4">
                      <div>
                        <p className="text-slate-500">Рівень</p>
                        <p className="tabular-nums text-slate-900">{detail.level}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Каса</p>
                        <p className="text-slate-900">{detail.requiresCashierAccount ? "так" : "ні"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Матвідповідальність</p>
                        <p className="text-slate-900">{detail.isMateriallyLiable ? "так" : "ні"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Харчова група</p>
                        <p className="text-slate-900">{detail.isFoodHandling ? "так" : "ні"}</p>
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
                            <td colSpan={canEdit ? 5 : 4} className="px-4 py-8 text-center text-sm text-slate-500">
                              У цього профілю ще немає компетенцій у довіднику.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
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

                  <Section
                    title="Атестація"
                    right={attestationForm ? <span className="text-sm text-slate-500">прохідний {attestationForm.passThresholdPercent}%</span> : null}
                  >
                    {!attestationLoaded && <p className="px-4 py-3 text-sm text-slate-500">Завантаження…</p>}
                    {attestationError && <p className="px-4 py-2 text-sm text-rose-700">{attestationError}</p>}
                    {attestationLoaded && !attestationForm && (
                      <div className="px-4 py-3">
                        {canEditTemplates ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-600">Форми ще немає. Прохідний бал:</span>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={newThreshold}
                              onChange={(e) => setNewThreshold(e.target.value)}
                              className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                            <span className="text-sm text-slate-600">%</span>
                            <button onClick={createAttestationForm} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                              Створити форму
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">
                            Для цієї посади ще не налаштовано форму атестації — атестація приймається простим позначенням "виконано".
                          </p>
                        )}
                      </div>
                    )}
                    {attestationLoaded && attestationForm && (
                      <div className="space-y-3 px-4 py-3">
                        {canEditTemplates && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-600">Прохідний бал:</span>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              defaultValue={attestationForm.passThresholdPercent}
                              onBlur={(e) => updateThreshold(e.target.value)}
                              className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                            <span className="text-sm text-slate-600">% від {attestationForm.maxScore}</span>
                            <button onClick={deleteAttestationForm} className="ml-auto text-xs text-rose-600 hover:text-rose-800">
                              видалити всю форму
                            </button>
                          </div>
                        )}

                        {attestationForm.sections.map((section) => {
                          const sectionMax = section.items.reduce((sum, i) => sum + i.maxPoints, 0);
                          const draft = newItemBySection[section.id] ?? { title: "", maxPoints: "2" };
                          return (
                            <div key={section.id} className="rounded border border-slate-200">
                              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1.5">
                                {canEditTemplates ? (
                                  <input
                                    key={section.id + section.title}
                                    defaultValue={section.title}
                                    onBlur={(e) => renameSection(section.id, e.target.value)}
                                    className="flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-slate-800 hover:border-slate-300 focus:border-slate-400 focus:bg-white"
                                  />
                                ) : (
                                  <span className="text-sm font-medium text-slate-800">{section.title}</span>
                                )}
                                <span className="text-slate-400 text-sm">({sectionMax})</span>
                                {canEditTemplates && (
                                  <button onClick={() => deleteSection(section.id)} className="ml-2 text-xs text-rose-600 hover:text-rose-800">
                                    видалити розділ
                                  </button>
                                )}
                              </div>
                              <ul className="divide-y divide-slate-100">
                                {section.items.map((item) => (
                                  <li key={item.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                                    {canEditTemplates ? (
                                      <input
                                        key={item.id + item.title}
                                        defaultValue={item.title}
                                        onBlur={(e) => renameItem(item.id, e.target.value)}
                                        className="flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-slate-700 hover:border-slate-300 focus:border-slate-400 focus:bg-white"
                                      />
                                    ) : (
                                      <span className="text-slate-700">{item.title}</span>
                                    )}
                                    <span className="flex items-center gap-2">
                                      <span className="text-slate-400">макс {item.maxPoints}</span>
                                      {canEditTemplates && (
                                        <button onClick={() => deleteItem(item.id)} className="text-xs text-rose-600 hover:text-rose-800">
                                          видалити
                                        </button>
                                      )}
                                    </span>
                                  </li>
                                ))}
                                {!section.items.length && <li className="px-3 py-2 text-xs text-slate-400">Пунктів ще немає.</li>}
                              </ul>
                              {canEditTemplates && (
                                <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-1.5">
                                  <input
                                    value={draft.title}
                                    onChange={(e) =>
                                      setNewItemBySection((prev) => ({ ...prev, [section.id]: { ...draft, title: e.target.value } }))
                                    }
                                    placeholder="Новий пункт"
                                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                                  />
                                  <input
                                    type="number"
                                    min={1}
                                    value={draft.maxPoints}
                                    onChange={(e) =>
                                      setNewItemBySection((prev) => ({ ...prev, [section.id]: { ...draft, maxPoints: e.target.value } }))
                                    }
                                    className="w-14 rounded border border-slate-300 px-2 py-1 text-xs"
                                  />
                                  <button onClick={() => addItem(section.id)} className="text-xs font-medium text-slate-700 hover:text-slate-900">
                                    + пункт
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {canEditTemplates && (
                          <div className="flex items-center gap-2">
                            <input
                              value={newSectionTitle}
                              onChange={(e) => setNewSectionTitle(e.target.value)}
                              placeholder="Назва нового розділу"
                              className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                            />
                            <button onClick={addSection} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                              + Розділ
                            </button>
                          </div>
                        )}
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
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Назва</th>
                  <th className="px-4 py-2 font-medium">Строк дії</th>
                  <th className="px-4 py-2 font-medium">Обнулення</th>
                  <th className="px-4 py-2 font-medium">Тип</th>
                  <th className="px-4 py-2 font-medium text-right">Посад використовують</th>
                  {canEdit && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {competencies.map((c) => (
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
                    disabled={!!editingMatId}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
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
                  <input
                    value={matUrl}
                    onChange={(e) => setMatUrl(e.target.value)}
                    placeholder="URL (необов'язково)"
                    className="w-64 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={matDuration}
                    onChange={(e) => setMatDuration(e.target.value)}
                    placeholder="Тривалість, хв"
                    type="number"
                    className="w-36 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <label className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input type="checkbox" checked={matSendViaBot} onChange={(e) => setMatSendViaBot(e.target.checked)} />
                    надсилати ботом
                  </label>
                </div>
                {matError && <p className="text-sm text-rose-700">{matError}</p>}
                <button
                  onClick={submitMaterial}
                  disabled={!matTitle.trim() || (!editingMatId && !matCompetencyId) || matSubmitting}
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {editingMatId ? "Зберегти" : "Створити"}
                </button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Матеріал</th>
                  <th className="px-4 py-2 font-medium">Тип</th>
                  <th className="px-4 py-2 font-medium">Компетенція</th>
                  <th className="px-4 py-2 font-medium text-right">Канал</th>
                  {canEdit && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materials.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 text-slate-800">{m.title}</td>
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
                ))}
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
