"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "../components/AppShell";

type Target = "GENERAL" | "AREA" | "PERSON";
type Item = { text: string; target: Target; areaTypeId: number | null; positionProfileId: number | null; inDaily: boolean };
type RegData = {
  canEdit: boolean;
  currentVersion: number | null;
  shown: { version: number; isCurrent: boolean; note: string | null; createdAt: string; items: Item[] } | null;
  versions: { version: number; isCurrent: boolean; note: string | null; createdAt: string; author: string | null; itemCount: number }[];
  areaTypes: { id: number; name: string }[];
  positions: { id: number; title: string }[];
};
type Store = {
  id: number;
  name: string;
  dailyTime: string | null;
  weeklyDay: number | null;
  weeklyTime: string | null;
  upcoming: { id: number; kind: "DAILY" | "WEEKLY"; status: string; plannedFor: string; postponedCount: number }[];
};

const DAYS = ["Понеділок", "Вівторок", "Середа", "Четвер", "П’ятниця", "Субота", "Неділя"];
const TARGET_LABEL: Record<Target, string> = { GENERAL: "Загальний стан", AREA: "Ділянка", PERSON: "Працівник" };
const fmt = (iso: string) => new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data: data as { error?: string; version?: number; unchanged?: boolean } };
}

export default function RegulationPage() {
  const [tab, setTab] = useState<"regulation" | "schedule">("regulation");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const [reg, setReg] = useState<RegData | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [viewVersion, setViewVersion] = useState<number | null>(null);

  const [stores, setStores] = useState<Store[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, { dailyTime: string; weeklyDay: string; weeklyTime: string }>>({});

  const loadReg = useCallback((version: number | null) => {
    fetch(`/api/regulation${version ? `?version=${version}` : ""}`)
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (!r.ok) throw new Error(b.error ?? "Не вдалося завантажити");
        setReg(b);
        setItems(b.shown?.items ?? []);
        setDirty(false);
        setNote("");
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);
  const loadSchedule = useCallback(() => {
    fetch("/api/inspection-schedule")
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (!r.ok) {
          setStores([]);
          return;
        }
        setStores(b.stores);
        setDrafts(Object.fromEntries(b.stores.map((s: Store) => [s.id, { dailyTime: s.dailyTime ?? "", weeklyDay: s.weeklyDay ? String(s.weeklyDay) : "", weeklyTime: s.weeklyTime ?? "" }])));
      })
      .catch(() => setStores([]));
  }, []);

  useEffect(() => loadReg(viewVersion), [viewVersion, loadReg]);
  useEffect(loadSchedule, [loadSchedule]);

  const update = (idx: number, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    setDirty(true);
  };
  const move = (idx: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setDirty(true);
  };

  const saveReg = async () => {
    const { ok, data } = await api("/api/regulation", "PUT", { items, note });
    setNotice({ ok, text: ok ? (data.unchanged ? "Змін немає — нову версію не створено" : `Збережено як версію ${data.version}`) : (data.error ?? "Не вдалося зберегти") });
    if (ok) {
      setViewVersion(null);
      loadReg(null);
      loadSchedule();
    }
  };

  const saveStore = async (s: Store) => {
    const d = drafts[s.id];
    const { ok, data } = await api(`/api/inspection-schedule/${s.id}`, "PUT", {
      dailyTime: d.dailyTime || null,
      weeklyDay: d.weeklyDay ? Number(d.weeklyDay) : null,
      weeklyTime: d.weeklyTime || null,
    });
    setNotice({ ok, text: ok ? `Розклад «${s.name}» збережено` : (data.error ?? "Не вдалося зберегти") });
    if (ok) loadSchedule();
  };

  if (error) {
    return (
      <AppShell active="/regulation">
        <div className="text-sm text-rose-700">{error}</div>
      </AppShell>
    );
  }
  if (!reg) {
    return (
      <AppShell active="/regulation">
        <div className="text-sm text-slate-500">Завантаження…</div>
      </AppShell>
    );
  }

  const readOnly = !reg.canEdit || (reg.shown ? !reg.shown.isCurrent : false);

  return (
    <AppShell active="/regulation">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Обходи: регламент і розклад</h2>
          <p className="mt-1 text-sm text-slate-500">
            Регламент — один на всю мережу, його змінюють сисадмін і COO. Кожна зміна створює нову версію; обхід, що вже йде, завершується за старою.
          </p>
        </div>

        <div className="flex gap-2 border-b border-slate-200">
          {(
            [
              ["regulation", "Регламент"],
              ["schedule", "Розклад по магазинах"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {notice && <p className={`rounded px-3 py-2 text-sm ${notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{notice.text}</p>}

        {tab === "regulation" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-600">
                {reg.shown ? `Версія ${reg.shown.version}${reg.shown.isCurrent ? " (чинна)" : " (стара, лише перегляд)"}` : "Регламенту ще немає"}
              </span>
              <select
                value={viewVersion ?? ""}
                onChange={(e) => setViewVersion(e.target.value ? Number(e.target.value) : null)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              >
                <option value="">Чинна версія</option>
                {reg.versions
                  .filter((v) => !v.isCurrent)
                  .map((v) => (
                    <option key={v.version} value={v.version}>
                      Версія {v.version} · {fmt(v.createdAt)}
                    </option>
                  ))}
              </select>
              {reg.shown?.note && <span className="text-xs text-slate-400">Примітка: {reg.shown.note}</span>}
            </div>

            <div className="rounded-md border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Вимога</th>
                    <th className="px-3 py-2 font-medium">Що оцінюється</th>
                    <th className="px-3 py-2 text-center font-medium" title="Входить у короткий щоденний обхід">
                      Щодня
                    </th>
                    {!readOnly && <th className="px-3 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => (
                    <tr key={idx} className="align-top">
                      <td className="px-3 py-2">
                        {readOnly ? (
                          it.text
                        ) : (
                          <input value={it.text} onChange={(e) => update(idx, { text: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {readOnly ? (
                          <span>
                            {TARGET_LABEL[it.target]}
                            {it.target === "AREA" && `: ${reg.areaTypes.find((t) => t.id === it.areaTypeId)?.name ?? "—"}`}
                            {it.target === "PERSON" && `: ${reg.positions.find((p) => p.id === it.positionProfileId)?.title ?? "—"}`}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            <select
                              value={it.target}
                              onChange={(e) => update(idx, { target: e.target.value as Target, areaTypeId: null, positionProfileId: null })}
                              className="rounded border border-slate-300 bg-white px-1.5 py-1 text-sm"
                            >
                              {(Object.keys(TARGET_LABEL) as Target[]).map((t) => (
                                <option key={t} value={t}>
                                  {TARGET_LABEL[t]}
                                </option>
                              ))}
                            </select>
                            {it.target === "AREA" && (
                              <select value={it.areaTypeId ?? ""} onChange={(e) => update(idx, { areaTypeId: Number(e.target.value) || null })} className="rounded border border-slate-300 bg-white px-1.5 py-1 text-sm">
                                <option value="">— тип ділянки —</option>
                                {reg.areaTypes.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            {it.target === "PERSON" && (
                              <select
                                value={it.positionProfileId ?? ""}
                                onChange={(e) => update(idx, { positionProfileId: Number(e.target.value) || null })}
                                className="rounded border border-slate-300 bg-white px-1.5 py-1 text-sm"
                              >
                                <option value="">— посада —</option>
                                {reg.positions.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.title}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={it.inDaily} disabled={readOnly} onChange={(e) => update(idx, { inDaily: e.target.checked })} />
                      </td>
                      {!readOnly && (
                        <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                          <button onClick={() => move(idx, -1)} className="px-1 text-slate-500 hover:text-slate-900" title="Вгору">
                            ↑
                          </button>
                          <button onClick={() => move(idx, 1)} className="px-1 text-slate-500 hover:text-slate-900" title="Вниз">
                            ↓
                          </button>
                          <button
                            onClick={() => {
                              setItems((prev) => prev.filter((_, i) => i !== idx));
                              setDirty(true);
                            }}
                            className="px-1 text-rose-600 hover:text-rose-800"
                          >
                            видалити
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!items.length && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                        Вимог ще немає.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {!readOnly && (
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setItems((prev) => [...prev, { text: "", target: "GENERAL", areaTypeId: null, positionProfileId: null, inDaily: false }]);
                    setDirty(true);
                  }}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  + Додати вимогу
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Що змінено (необов’язково)"
                    className="w-full max-w-sm rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  />
                  <button disabled={!dirty} onClick={saveReg} className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                    Зберегти як нову версію
                  </button>
                  {dirty && (
                    <button onClick={() => loadReg(viewVersion)} className="text-sm text-slate-500 underline">
                      скасувати зміни
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400">«Щодня» — вимога потрапляє в короткий щоденний обхід. У щотижневий (детальний) входять усі вимоги.</p>
              </div>
            )}

            <div className="rounded-md border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">Історія версій</div>
              <ul className="divide-y divide-slate-100 text-sm">
                {reg.versions.map((v) => (
                  <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                    <span>
                      Версія {v.version} {v.isCurrent && <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">чинна</span>}
                      <span className="ml-2 text-xs text-slate-400">
                        {fmt(v.createdAt)} · {v.author ?? "система"} · вимог: {v.itemCount}
                        {v.note ? ` · ${v.note}` : ""}
                      </span>
                    </span>
                    {!v.isCurrent && (
                      <button onClick={() => setViewVersion(v.version)} className="text-xs text-slate-600 hover:text-slate-900">
                        переглянути
                      </button>
                    )}
                  </li>
                ))}
                {!reg.versions.length && <li className="px-4 py-4 text-center text-slate-400">Історії ще немає.</li>}
              </ul>
            </div>
          </div>
        )}

        {tab === "schedule" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Щоденний обхід — короткий, лише вимоги з позначкою «Щодня». Щотижневий — детальний, за всіма вимогами. Якщо обхід не проведено за день, він переноситься на
              наступний день на той самий час, а адмін, директор кластера й COO отримують повідомлення.
            </p>
            {stores === null && <p className="text-sm text-slate-500">Завантаження…</p>}
            {stores?.length === 0 && <p className="text-sm text-slate-500">Немає магазинів, розклад яких ви можете змінювати.</p>}
            {stores?.map((s) => {
              const d = drafts[s.id] ?? { dailyTime: "", weeklyDay: "", weeklyTime: "" };
              const setD = (patch: Partial<typeof d>) => setDrafts((prev) => ({ ...prev, [s.id]: { ...d, ...patch } }));
              return (
                <div key={s.id} className="rounded-md border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                  <div className="mt-2 flex flex-wrap items-end gap-3 text-xs text-slate-600">
                    <label>
                      Щоденний о
                      <input type="time" value={d.dailyTime} onChange={(e) => setD({ dailyTime: e.target.value })} className="mt-0.5 block rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
                    </label>
                    <label>
                      Щотижневий: день
                      <select value={d.weeklyDay} onChange={(e) => setD({ weeklyDay: e.target.value })} className="mt-0.5 block rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                        <option value="">— немає —</option>
                        {DAYS.map((name, i) => (
                          <option key={i} value={i + 1}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      о
                      <input type="time" value={d.weeklyTime} onChange={(e) => setD({ weeklyTime: e.target.value })} className="mt-0.5 block rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
                    </label>
                    <button onClick={() => saveStore(s)} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                      Зберегти
                    </button>
                  </div>
                  {s.upcoming.length > 0 && (
                    <ul className="mt-3 space-y-0.5 text-xs text-slate-500">
                      {s.upcoming.map((u) => (
                        <li key={u.id}>
                          {u.kind === "DAILY" ? "Щоденний" : "Щотижневий"}: {fmt(u.plannedFor)}
                          {u.status === "IN_PROGRESS" && " · іде зараз"}
                          {u.postponedCount > 0 && <span className="text-amber-700"> · перенесено разів: {u.postponedCount}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
