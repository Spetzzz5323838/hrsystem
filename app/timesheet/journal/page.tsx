"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../components/AppShell";
import { CORRECTION_REASONS, KIND_LABELS, REASON_LABELS } from "../../../lib/timesheetReasons";

type Row = {
  id: number;
  createdAt: string;
  kind: string;
  employmentId: number;
  employeeName: string;
  positionTitle: string;
  storeName: string;
  shiftDate: string;
  beforeStartedAt: string | null;
  beforeEndedAt: string | null;
  afterStartedAt: string | null;
  afterEndedAt: string | null;
  deltaMinutes: number;
  reason: string;
  reasonLabel: string;
  comment: string | null;
  actorName: string;
  periodClosed: boolean;
};
type Data = {
  rows: Row[];
  summary: {
    total: number;
    manualCount: number;
    autoCount: number;
    addedMinutes: number;
    removedMinutes: number;
    closedPeriodCount: number;
    byReason: { reason: string; label: string; count: number }[];
    byActor: { actorId: number | null; name: string; count: number; netMinutes: number }[];
    byEmployee: { employmentId: number; name: string; count: number; netMinutes: number; frequent: boolean }[];
  };
  options: { stores: { id: number; name: string }[]; employees: { id: number; name: string }[]; actors: { id: number; name: string }[] };
};

const hm = (minutes: number) => {
  const sign = minutes < 0 ? "−" : minutes > 0 ? "+" : "";
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
};
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) : "…");
const range = (a: string | null, b: string | null) => (a ? `${time(a)}–${b ? time(b) : "…"}` : "—");
const day = (iso: string) => new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
const stamp = (iso: string) => new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Журнал правок табеля: хто, коли, чому й на скільки змінив робочий час (записи не редагуються). */
export default function TimesheetJournalPage() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [objectId, setObjectId] = useState("");
  const [employmentId, setEmploymentId] = useState("");
  const [actorId, setActorId] = useState("");
  const [reason, setReason] = useState("");
  const [showAuto, setShowAuto] = useState(true);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = () => {
    const q = new URLSearchParams({ month });
    if (objectId) q.set("objectId", objectId);
    if (employmentId) q.set("employmentId", employmentId);
    if (actorId) q.set("actorId", actorId);
    if (reason) q.set("reason", reason);
    if (!showAuto) q.set("auto", "0");
    return q.toString();
  };

  useEffect(() => {
    fetch(`/api/timesheet/journal?${query()}`)
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (!r.ok) throw new Error(b.error ?? "Не вдалося завантажити");
        setData(b);
        setError(null);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, objectId, employmentId, actorId, reason, showAuto]);

  if (error) {
    return (
      <AppShell active="/timesheet">
        <div className="text-sm text-rose-700">{error}</div>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell active="/timesheet">
        <div className="text-sm text-slate-500">Завантаження…</div>
      </AppShell>
    );
  }
  const { summary: sm } = data;

  return (
    <AppShell active="/timesheet">
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">Журнал правок табеля</h2>
          <Link href="/timesheet" className="text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900">
            ← До табеля
          </Link>
        </div>
        <p className="text-sm text-slate-500">
          Тут видно, хто, коли, чому й на скільки змінив робочий час працівників. Записи лише додаються й не редагуються. Період — за датою самої зміни.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
          <select value={objectId} onChange={(e) => setObjectId(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Усі магазини</option>
            {data.options.stores.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select value={employmentId} onChange={(e) => setEmploymentId(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Усі працівники</option>
            {data.options.employees.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select value={actorId} onChange={(e) => setActorId(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Усі, хто виправляв</option>
            {data.options.actors.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Усі причини</option>
            {CORRECTION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
            <option value="AUTO_CLOSE">{REASON_LABELS.AUTO_CLOSE}</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} />
            з автозакриттям
          </label>
          <a href={`/api/timesheet/journal/export?${query()}`} className="ml-auto rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Експорт в Excel
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Правок вручну</p>
            <p className="text-xl font-semibold tabular-nums">{sm.manualCount}</p>
            <p className="text-xs text-slate-400">автозакриттів: {sm.autoCount}</p>
          </div>
          <div className="rounded border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Додано годин</p>
            <p className="text-xl font-semibold tabular-nums text-emerald-700">{hm(sm.addedMinutes)}</p>
          </div>
          <div className="rounded border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Прибрано годин</p>
            <p className="text-xl font-semibold tabular-nums text-rose-700">{hm(-sm.removedMinutes)}</p>
          </div>
          <div className="rounded border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Після закриття періоду</p>
            <p className="text-xl font-semibold tabular-nums">{sm.closedPeriodCount}</p>
          </div>
        </div>

        {sm.total > 0 && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">За причинами</p>
              <ul className="space-y-0.5 text-xs">
                {sm.byReason.map((r) => (
                  <li key={r.reason} className="flex justify-between gap-2">
                    <span className="text-slate-700">{r.label}</span>
                    <span className="tabular-nums text-slate-500">{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">Хто виправляв (вручну)</p>
              <ul className="space-y-0.5 text-xs">
                {sm.byActor.map((a) => (
                  <li key={a.actorId ?? "x"} className="flex justify-between gap-2">
                    <span className="text-slate-700">{a.name}</span>
                    <span className="tabular-nums text-slate-500">
                      {a.count} · {hm(a.netMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">Чий час виправляли найчастіше</p>
              <ul className="space-y-0.5 text-xs">
                {sm.byEmployee.map((e) => (
                  <li key={e.employmentId} className="flex justify-between gap-2">
                    <span className="text-slate-700">
                      {e.name}
                      {e.frequent && <span className="ml-1 rounded bg-rose-50 px-1 text-rose-700">часто</span>}
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {e.count} · {hm(e.netMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Виправлено</th>
                <th className="px-3 py-2 font-medium">Працівник</th>
                <th className="px-3 py-2 font-medium">Зміна</th>
                <th className="px-3 py-2 font-medium">Було → стало</th>
                <th className="px-3 py-2 text-right font-medium">Різниця</th>
                <th className="px-3 py-2 font-medium">Причина</th>
                <th className="px-3 py-2 font-medium">Хто</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{stamp(r.createdAt)}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-900">{r.employeeName}</span>
                    <span className="block text-xs text-slate-400">
                      {r.positionTitle} · {r.storeName}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {day(r.shiftDate)}
                    <span className="block text-xs text-slate-400">{KIND_LABELS[r.kind] ?? r.kind}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">
                    {range(r.beforeStartedAt, r.beforeEndedAt)} → {r.kind === "CANCEL" ? "скасовано" : range(r.afterStartedAt, r.afterEndedAt)}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${r.deltaMinutes < 0 ? "text-rose-700" : "text-emerald-700"}`}>{hm(r.deltaMinutes)}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.reasonLabel}
                    {r.comment && <span className="block text-xs text-slate-500">{r.comment}</span>}
                    {r.periodClosed && <span className="mt-0.5 inline-block rounded bg-amber-50 px-1 text-xs text-amber-800">закритий період</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.actorName}</td>
                </tr>
              ))}
              {!data.rows.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    За цей період правок немає.
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
