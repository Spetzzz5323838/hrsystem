"use client";

import { useCallback, useEffect, useState } from "react";

type Data = {
  eligible: boolean;
  mainObjectName: string;
  roleTitle: string;
  items: { id: number; orgNodeId: number; name: string }[];
  options: { id: number; name: string }[];
};

/**
 * "Додаткові об'єкти керування": адміністратор, який відповідає ще й за інші магазини.
 * Показується лише тим, хто керує доступами, і лише для посад адміністратора магазину.
 */
export default function ExtraObjectsBlock({ employmentId }: { employmentId: string | number }) {
  const [data, setData] = useState<Data | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/employees/${employmentId}/extra-objects`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, [employmentId]);
  useEffect(load, [load]);

  if (!data?.eligible) return null;

  const run = (promise: Promise<Response>) => {
    setBusy(true);
    setError(null);
    promise
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error ?? "Не вдалося виконати");
        setPick("");
        load();
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-white px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">Додаткові об&rsquo;єкти керування</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Основний об&rsquo;єкт: <b>{data.mainObjectName}</b>. Якщо людина відповідає ще й за інші магазини, додайте їх тут: вона отримає ті самі права й ті самі задачі
          (прийом, звільнення, обходи) і по цих об&rsquo;єктах. Посада в людини при цьому одна.
        </p>
      </div>
      {data.items.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm">
          {data.items.map((i) => (
            <li key={i.id} className="flex items-center justify-between py-1.5">
              <span>{i.name}</span>
              <button
                disabled={busy}
                onClick={() => confirm(`Прибрати «${i.name}» з об'єктів керування цієї людини?`) && run(fetch(`/api/employees/${employmentId}/extra-objects?assignmentId=${i.id}`, { method: "DELETE" }))}
                className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-40"
              >
                прибрати
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <option value="">— додати об&rsquo;єкт —</option>
          {data.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button
          disabled={!pick || busy}
          onClick={() => run(fetch(`/api/employees/${employmentId}/extra-objects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgNodeId: Number(pick) }) }))}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Додати
        </button>
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
