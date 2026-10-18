"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "../components/AppShell";

type AreaRow = {
  id: number;
  isActive: boolean;
  typeId: number;
  name: string;
  requiresStaff: boolean;
  isGeneral: boolean;
  responsibles: { employmentId: number; fullName: string }[];
};
type StoreData = {
  stores: { id: number; name: string }[];
  store: { id: number; name: string; openTime: string | null } | null;
  candidates?: { employmentId: number; fullName: string; positionTitle: string }[];
  areas?: AreaRow[];
};
type AreaType = { id: number; name: string; requiresStaff: boolean; isGeneral: boolean; isActive: boolean };

async function api(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: { error?: string } & Record<string, unknown> }> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

export default function AreasPage() {
  const [storeId, setStoreId] = useState("");
  const [data, setData] = useState<StoreData | null>(null);
  const [types, setTypes] = useState<AreaType[]>([]);
  const [canEditTypes, setCanEditTypes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [openTime, setOpenTime] = useState("");
  const [editingAreaId, setEditingAreaId] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [addTypeId, setAddTypeId] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeKind, setNewTypeKind] = useState<"staff" | "plain" | "general">("staff");

  const loadStore = useCallback((id: string) => {
    fetch(`/api/areas${id ? `?storeId=${id}` : ""}`)
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (!r.ok) throw new Error(b.error ?? "Не вдалося завантажити");
        setData(b);
        setOpenTime(b.store?.openTime ?? "");
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);
  const loadTypes = useCallback(() => {
    fetch("/api/area-types")
      .then((r) => r.json())
      .then((b) => {
        setTypes(b.types ?? []);
        setCanEditTypes(Boolean(b.canEdit));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadStore(storeId);
  }, [storeId, loadStore]);
  useEffect(loadTypes, [loadTypes]);

  const run = async (promise: ReturnType<typeof api>, successText: string, after?: () => void) => {
    const { ok, data: body } = await promise;
    setNotice({ ok, text: ok ? successText : (body.error ?? "Не вдалося виконати") });
    if (ok) {
      after?.();
      loadStore(storeId);
      loadTypes();
    }
  };

  if (error) {
    return (
      <AppShell active="/areas">
        <div className="text-sm text-rose-700">{error}</div>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell active="/areas">
        <div className="text-sm text-slate-500">Завантаження…</div>
      </AppShell>
    );
  }

  const activeAreas = (data.areas ?? []).filter((a) => a.isActive);
  const usedTypeIds = new Set(activeAreas.map((a) => a.typeId));
  const freeTypes = types.filter((t) => t.isActive && !usedTypeIds.has(t.id));

  return (
    <AppShell active="/areas">
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Ділянки</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ділянка — частина магазину, за яку відповідають конкретні люди (Гастроном, Молочка, Каси) або яка спільна для всіх (Вхідна група, Освітлення). За цим
            будуватимуться обходи й алерти.
          </p>
        </div>

        <select value={storeId || data.store?.id || ""} onChange={(e) => setStoreId(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
          {!data.store && <option value="">— оберіть магазин —</option>}
          {data.stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {notice && <p className={`rounded px-3 py-2 text-sm ${notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{notice.text}</p>}

        {data.store && (
          <>
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">Час відкриття</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Через 30 хвилин після нього система перевірить, чи відмітився хтось із відповідальних за кожну ділянку, де має бути персонал. Якщо ні — адміністратор
                отримає повідомлення. Порожньо — перевірки немає.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
                <button
                  onClick={() => run(api("/api/areas/store", "PATCH", { orgNodeId: data.store!.id, openTime }), "Час відкриття збережено")}
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Зберегти
                </button>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
                <p className="text-sm font-semibold text-slate-800">
                  Ділянки: {data.store.name} <span className="font-normal text-slate-400">({activeAreas.length})</span>
                </p>
                <div className="flex items-center gap-2">
                  <select value={addTypeId} onChange={(e) => setAddTypeId(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-sm">
                    <option value="">— додати ділянку —</option>
                    {freeTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!addTypeId}
                    onClick={() => run(api("/api/areas", "POST", { orgNodeId: data.store!.id, areaTypeId: Number(addTypeId) }), "Ділянку додано", () => setAddTypeId(""))}
                    className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    Додати
                  </button>
                </div>
              </div>
              <ul className="divide-y divide-slate-100">
                {activeAreas.map((a) => (
                  <li key={a.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-slate-900">{a.name}</span>
                        {a.isGeneral ? (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">загальна</span>
                        ) : a.requiresStaff ? (
                          <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700">має бути персонал</span>
                        ) : null}
                      </div>
                      <div className="flex gap-3 text-xs">
                        {!a.isGeneral && (
                          <button
                            onClick={() => {
                              setEditingAreaId(editingAreaId === a.id ? null : a.id);
                              setPicked(new Set(a.responsibles.map((r) => r.employmentId)));
                            }}
                            className="text-slate-600 hover:text-slate-900"
                          >
                            відповідальні
                          </button>
                        )}
                        <button
                          onClick={() => confirm(`Зняти ділянку «${a.name}» з магазину?`) && run(api(`/api/areas/${a.id}`, "PATCH", { isActive: false }), "Ділянку знято")}
                          className="text-rose-600 hover:text-rose-800"
                        >
                          зняти
                        </button>
                      </div>
                    </div>
                    {!a.isGeneral && (
                      <p className="mt-1 text-slate-600">
                        {a.responsibles.length ? a.responsibles.map((r) => r.fullName).join(", ") : <span className="text-amber-700">відповідальних не призначено</span>}
                      </p>
                    )}
                    {editingAreaId === a.id && (
                      <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-3">
                        <div className="grid gap-1 sm:grid-cols-2">
                          {(data.candidates ?? []).map((c) => (
                            <label key={c.employmentId} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={picked.has(c.employmentId)}
                                onChange={(e) => {
                                  const next = new Set(picked);
                                  if (e.target.checked) next.add(c.employmentId);
                                  else next.delete(c.employmentId);
                                  setPicked(next);
                                }}
                              />
                              {c.fullName} <span className="text-xs text-slate-400">· {c.positionTitle}</span>
                            </label>
                          ))}
                          {!(data.candidates ?? []).length && <p className="text-sm text-slate-400">У магазині немає працівників.</p>}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => run(api(`/api/areas/${a.id}`, "PATCH", { responsibleIds: [...picked] }), "Відповідальних збережено", () => setEditingAreaId(null))}
                            className="rounded bg-slate-900 px-3 py-1 text-sm font-medium text-white"
                          >
                            Зберегти
                          </button>
                          <button onClick={() => setEditingAreaId(null)} className="rounded border border-slate-300 bg-white px-3 py-1 text-sm">
                            Скасувати
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
                {!activeAreas.length && <li className="px-4 py-6 text-center text-sm text-slate-400">Ділянок ще немає — додайте зі списку вище.</li>}
              </ul>
            </div>
          </>
        )}

        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">
            Типи ділянок <span className="font-normal text-slate-400">(спільні для всієї мережі{canEditTypes ? "" : ", лише перегляд"})</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {types.map((t) => (
              <li key={t.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm ${t.isActive ? "" : "text-slate-400"}`}>
                <span>
                  {t.name}{" "}
                  <span className="text-xs text-slate-400">
                    {t.isGeneral ? "· загальна" : t.requiresStaff ? "· має бути персонал" : "· без перевірки персоналу"}
                    {!t.isActive && " · вимкнено"}
                  </span>
                </span>
                {canEditTypes && (
                  <span className="flex gap-3 text-xs">
                    {!t.isGeneral && (
                      <button
                        onClick={() => run(api(`/api/area-types/${t.id}`, "PATCH", { requiresStaff: !t.requiresStaff }), "Збережено")}
                        className="text-slate-600 hover:text-slate-900"
                      >
                        {t.requiresStaff ? "не вимагати персонал" : "вимагати персонал"}
                      </button>
                    )}
                    <button
                      onClick={() => run(api(`/api/area-types/${t.id}`, "PATCH", { isActive: !t.isActive }), "Збережено")}
                      className="text-slate-600 hover:text-slate-900"
                    >
                      {t.isActive ? "вимкнути" : "увімкнути"}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {canEditTypes && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3">
              <input
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="Назва нового типу"
                className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
              <select value={newTypeKind} onChange={(e) => setNewTypeKind(e.target.value as typeof newTypeKind)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                <option value="staff">Має бути персонал</option>
                <option value="plain">Без перевірки персоналу</option>
                <option value="general">Загальна (без відповідальних)</option>
              </select>
              <button
                disabled={!newTypeName.trim()}
                onClick={() =>
                  run(
                    api("/api/area-types", "POST", { name: newTypeName, isGeneral: newTypeKind === "general", requiresStaff: newTypeKind === "staff" }),
                    "Тип додано",
                    () => setNewTypeName(""),
                  )
                }
                className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Додати тип
              </button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
