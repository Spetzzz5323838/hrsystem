"use client";

import { useEffect, useState } from "react";

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
  const [tab, setTab] = useState<"pos" | "comp" | "mat">("pos");
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

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

  useEffect(() => {
    setDetail(null);
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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

  if (error) {
    return <div className="px-6 py-6 text-sm text-rose-700">{error}</div>;
  }

  if (!profiles || !competencies || !materials) {
    return <div className="px-6 py-6 text-sm text-slate-500">Завантаження…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-6">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Довідники</h2>

        <div className="flex gap-1 border-b border-slate-200">
          {(
            [
              ["pos", "Профілі посад"],
              ["comp", "Компетенції"],
              ["mat", "Матеріали"],
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
      </div>
    </div>
  );
}
