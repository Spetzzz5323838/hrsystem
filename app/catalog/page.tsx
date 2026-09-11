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
  competencyName: string;
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

  const [profiles, setProfiles] = useState<ProfileListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProfileDetail | null>(null);

  const [competencies, setCompetencies] = useState<CompetencyRow[] | null>(null);
  const [materials, setMaterials] = useState<MaterialRow[] | null>(null);

  useEffect(() => {
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
        setSelectedId(p[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedId == null) return;
    setDetail(null);
    fetch(`/api/position-profiles/${selectedId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити профіль");
        return r.json();
      })
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, [selectedId]);

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
                          </tr>
                        ))}
                        {!detail.competencies.length && (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                              У цього профілю ще немає компетенцій у довіднику.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </Section>
                </>
              )}
            </div>
          </div>
        )}

        {tab === "comp" && (
          <Section title="Компетенції">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Назва</th>
                  <th className="px-4 py-2 font-medium">Строк дії</th>
                  <th className="px-4 py-2 font-medium">Обнулення</th>
                  <th className="px-4 py-2 font-medium">Тип</th>
                  <th className="px-4 py-2 font-medium text-right">Посад використовують</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {tab === "mat" && (
          <Section title="Навчальні матеріали">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Матеріал</th>
                  <th className="px-4 py-2 font-medium">Тип</th>
                  <th className="px-4 py-2 font-medium">Компетенція</th>
                  <th className="px-4 py-2 font-medium text-right">Канал</th>
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
