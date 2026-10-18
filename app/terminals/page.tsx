"use client";

import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";

type TerminalRow = {
  id: number;
  name: string;
  storeName: string;
  registeredByName: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
};
type ListResponse = { objects: { id: number; name: string }[]; terminals: TerminalRow[] };

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function TerminalsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orgNodeId, setOrgNodeId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justRegistered, setJustRegistered] = useState<string | null>(null);

  const load = () => {
    fetch("/api/terminals")
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Немає доступу до терміналів" : "Не вдалося завантажити");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const register = () => {
    setBusy(true);
    setFormError(null);
    setJustRegistered(null);
    fetch("/api/terminals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgNodeId: Number(orgNodeId), name: name.trim() }),
    })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error ?? "Не вдалося зареєструвати");
        const storeName = data?.objects.find((o) => o.id === Number(orgNodeId))?.name ?? "";
        setJustRegistered(`Цей комп'ютер зареєстровано як «${name.trim()}» (${storeName}). Тепер на ньому можна відкривати сторінку «Термінал».`);
        setName("");
        load();
      })
      .catch((e) => setFormError(e.message))
      .finally(() => setBusy(false));
  };

  const revoke = (t: TerminalRow) => {
    if (!confirm(`Відкликати термінал «${t.name}» (${t.storeName})? Цей комп'ютер більше не зможе реєструвати прибуття.`)) return;
    fetch(`/api/terminals/${t.id}`, { method: "DELETE" })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error ?? "Не вдалося відкликати");
        load();
      })
      .catch((e) => setError(e.message));
  };

  if (error) {
    return (
      <AppShell active="/terminals">
        <div className="text-sm text-rose-700">{error}</div>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell active="/terminals">
        <div className="text-sm text-slate-500">Завантаження…</div>
      </AppShell>
    );
  }

  return (
    <AppShell active="/terminals">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Термінали обліку робочого часу</h2>

        <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <p className="font-medium">Як налаштувати термінал на касі</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5">
            <li>Сядьте за той комп&rsquo;ютер, який стане терміналом (на касі), і відкрийте цю сторінку під своїм логіном.</li>
            <li>Оберіть магазин і дайте комп&rsquo;ютеру назву («Каса 1») — натисніть «Зареєструвати цей комп&rsquo;ютер». Магазин запам&rsquo;ятається саме на цьому комп&rsquo;ютері.</li>
            <li>
              Старший касир чи адміністратор магазину щоранку відкриває на ньому сторінку «Термінал» (у меню зліва), входить зі своїм
              логіном і сканує бейджі працівників.
            </li>
            <li>Не реєструйте термінал на загальному чи чужому комп&rsquo;ютері. Якщо комп&rsquo;ютер списано чи вкрадено — відкличте його у списку нижче.</li>
            <li>Очищення даних браузера скидає реєстрацію — тоді комп&rsquo;ютер треба зареєструвати знову.</li>
          </ol>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-800">Зареєструвати цей комп&rsquo;ютер як термінал</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <select value={orgNodeId} onChange={(e) => setOrgNodeId(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">— магазин —</option>
              {data.objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Назва комп'ютера (напр. Каса 1)"
              className="w-64 rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              disabled={busy || !orgNodeId || !name.trim()}
              onClick={register}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Зареєструвати цей комп&rsquo;ютер
            </button>
          </div>
          {formError && <p className="mt-2 text-sm text-rose-700">{formError}</p>}
          {justRegistered && <p className="mt-2 text-sm text-emerald-700">{justRegistered}</p>}
        </div>

        <div className="rounded-md border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Термінал</th>
                <th className="px-4 py-2 font-medium">Магазин</th>
                <th className="px-4 py-2 font-medium">Зареєстрував</th>
                <th className="px-4 py-2 font-medium">Востаннє на зв&rsquo;язку</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.terminals.map((t) => (
                <tr key={t.id} className={t.revokedAt ? "text-slate-400" : ""}>
                  <td className="px-4 py-2">{t.name}</td>
                  <td className="px-4 py-2">{t.storeName}</td>
                  <td className="px-4 py-2">
                    {t.registeredByName} <span className="text-xs text-slate-400">· {fmt(t.createdAt)}</span>
                  </td>
                  <td className="px-4 py-2">{t.revokedAt ? `відкликано ${fmt(t.revokedAt)}` : fmt(t.lastSeenAt)}</td>
                  <td className="px-4 py-2 text-right">
                    {!t.revokedAt && (
                      <button onClick={() => revoke(t)} className="text-xs text-rose-600 hover:text-rose-800">
                        відкликати
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!data.terminals.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Терміналів ще немає.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
