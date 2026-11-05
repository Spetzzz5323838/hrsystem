"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "../components/AppShell";

type Rule = { eventCode: string; title: string; description: string; enabled: boolean; minLevel: number; includeAccountants: boolean };
type EventRow = { id: number; title: string; node: string; text: string; createdAt: string; dispatchedAt: string | null };

const LEVELS = [
  { value: 20, label: "від старшого персоналу (20)" },
  { value: 30, label: "від адміністратора магазину (30)" },
  { value: 40, label: "від директора кластера (40)" },
  { value: 50, label: "від COO / фін. директора (50)" },
  { value: 60, label: "лише власник (60)" },
];

const fmt = (iso: string) => new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Центр сповіщень: кому за замовчуванням приходить кожна подія + журнал подій. Сама розсилка — зведенням о 18:00. */
export default function NotificationsPage() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/event-rules");
    const b = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(b.error ?? "Не вдалося завантажити");
      return;
    }
    setRules(b.rules);
    setEvents(b.events);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (rule: Rule, patch: Partial<Rule>) => {
    const next = { ...rule, ...patch };
    setRules((prev) => prev && prev.map((r) => (r.eventCode === rule.eventCode ? next : r)));
    const r = await fetch("/api/event-rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setError(b.error ?? "Не вдалося зберегти");
      load();
    }
  };

  return (
    <AppShell active="/notifications">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Сповіщення про події</h2>
        <p className="text-sm text-slate-500">
          Події збираються протягом дня й надсилаються в Telegram одним зведенням о 18:00. Нижче — кому подія приходить за замовчуванням. Кожен керівник може сам увімкнути чи вимкнути
          будь-яку подію в боті (кнопка «🔔 Підписки») — його вибір сильніший за правило. Подію бачить лише той, чия область (магазин, кластер, компанія) охоплює місце події.
        </p>
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="space-y-2">
          {rules?.map((r) => (
            <div key={r.eventCode} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{r.title}</p>
                  <p className="text-xs text-slate-500">{r.description}</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => save(r, { enabled: e.target.checked })} /> Надсилати
                </label>
              </div>
              {r.enabled && (
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    За замовчуванням:
                    <select value={r.minLevel} onChange={(e) => save(r, { minLevel: Number(e.target.value) })} className="rounded-md border border-slate-300 px-2 py-1">
                      {LEVELS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={r.includeAccountants} onChange={(e) => save(r, { includeAccountants: e.target.checked })} /> і бухгалтерам
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>

        <h3 className="pt-2 text-lg font-semibold text-slate-900">Останні події</h3>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">Подій ще не було.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {events.map((e) => (
              <div key={e.id} className="border-b border-slate-100 px-4 py-2 text-sm last:border-b-0">
                <p className="text-slate-900">{e.text}</p>
                <p className="text-xs text-slate-500">
                  {e.title} · {fmt(e.createdAt)} · {e.dispatchedAt ? `у зведенні ${fmt(e.dispatchedAt)}` : "чекає зведення"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
