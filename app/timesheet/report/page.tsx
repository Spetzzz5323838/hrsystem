"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../components/AppShell";

type Row = {
  employmentId: number;
  fullName: string;
  positionTitle: string;
  unitId: number;
  unitName: string;
  minutesByDay: Record<string, number>;
  totalMinutes: number;
  hasOpenShift: boolean;
};
type Data = {
  days: string[];
  rows: Row[];
  dayTotals: Record<string, number>;
  grandTotalMinutes: number;
  units: { id: number; name: string; type: string; depth: number }[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
/** День місяця й скорочена назва дня тижня для шапки стовпчика. */
const dayParts = (key: string) => {
  const d = new Date(`${key}T00:00:00`);
  return { num: d.getDate(), wd: d.toLocaleDateString("uk-UA", { weekday: "short" }), weekend: d.getDay() === 0 || d.getDay() === 6 };
};

export default function TimesheetReportPage() {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(now));
  const [unitId, setUnitId] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Пошук за ПІБ — з невеликою затримкою, щоб не слати запит на кожну літеру.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!from || !to) return;
    const q = new URLSearchParams({ from, to });
    if (unitId) q.set("unitId", unitId);
    if (query.trim()) q.set("q", query.trim());
    fetch(`/api/timesheet/report?${q}`)
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (!r.ok) throw new Error(b.error ?? "Не вдалося завантажити");
        setData(b);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [from, to, unitId, query]);

  // Рядки вже відсортовані за деревом, тож групи йдуть підряд; у кожної — власні підсумки по днях.
  const groups: { unitId: number; unitName: string; rows: Row[]; dayTotals: Record<string, number>; total: number }[] = [];
  for (const r of data?.rows ?? []) {
    let g = groups[groups.length - 1];
    if (!g || g.unitId !== r.unitId) {
      g = { unitId: r.unitId, unitName: r.unitName, rows: [], dayTotals: {}, total: 0 };
      groups.push(g);
    }
    g.rows.push(r);
    g.total += r.totalMinutes;
    for (const [k, v] of Object.entries(r.minutesByDay)) g.dayTotals[k] = (g.dayTotals[k] ?? 0) + v;
  }

  // Експорт бере ті самі фільтри, що й екран (пошук — той, що вже застосований до таблиці).
  const exportParams = new URLSearchParams({ from, to });
  if (unitId) exportParams.set("unitId", unitId);
  if (query.trim()) exportParams.set("q", query.trim());
  const exportQuery = exportParams.toString();

  const input = "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";

  return (
    <AppShell active="/timesheet">
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">Звіт по днях</h2>
          <div className="flex items-center gap-3">
            <a href={`/api/timesheet/report/export?${exportQuery}`} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
              Експорт в Excel
            </a>
            <Link href="/timesheet" className="text-sm text-slate-600 hover:text-slate-900">
              ← до табеля
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600">
            З
            <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${input} mt-0.5 block`} />
          </label>
          <label className="text-xs text-slate-600">
            По
            <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${input} mt-0.5 block`} />
          </label>
          <label className="text-xs text-slate-600">
            Підрозділ
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={`${input} mt-0.5 block`}>
              <option value="">Усі</option>
              {data?.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {"  ".repeat(u.depth)}
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Працівник
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ПІБ або частина" className={`${input} mt-0.5 block`} />
          </label>
        </div>

        {error && <div className="text-sm text-rose-700">{error}</div>}
        {!data && !error && <div className="text-sm text-slate-500">Завантаження…</div>}

        {data && !error && (
          <>
            <p className="text-sm text-slate-500">
              {data.rows.length} працівників · разом {hm(data.grandTotalMinutes)} год. Зміна враховується в день початку.
            </p>
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-medium">Працівник</th>
                    {data.days.map((k) => {
                      const p = dayParts(k);
                      return (
                        <th key={k} className={`px-2 py-2 text-center font-medium ${p.weekend ? "bg-slate-100 text-rose-600" : ""}`}>
                          <div>{p.num}</div>
                          <div className="text-[10px] font-normal">{p.wd}</div>
                        </th>
                      );
                    })}
                    <th className="px-3 py-2 text-right font-medium text-slate-700">Разом</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groups.map((g) => (
                    <Fragment key={g.unitId}>
                      <tr className="bg-slate-100 text-xs font-semibold text-slate-700">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-slate-100 px-3 py-1.5">
                          {g.unitName} <span className="font-normal text-slate-500">· {g.rows.length}</span>
                        </td>
                        {data.days.map((k) => (
                          <td key={k} className="px-2 py-1.5 text-center tabular-nums">
                            {g.dayTotals[k] ? hm(g.dayTotals[k]) : ""}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{hm(g.total)}</td>
                      </tr>
                      {g.rows.map((r) => (
                    <tr key={r.employmentId} className="hover:bg-slate-50">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5">
                        <div className="font-medium text-slate-900">
                          {r.fullName}
                          {r.hasOpenShift && <span className="ml-1 rounded bg-sky-50 px-1 text-[10px] font-normal text-sky-700">зміна триває</span>}
                        </div>
                        <div className="text-xs text-slate-500">{r.positionTitle}</div>
                      </td>
                      {data.days.map((k) => (
                        <td key={k} className="px-2 py-1.5 text-center tabular-nums text-slate-700">
                          {r.minutesByDay[k] ? hm(r.minutesByDay[k]) : ""}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums text-slate-900">{hm(r.totalMinutes)}</td>
                    </tr>
                      ))}
                    </Fragment>
                  ))}
                  {!data.rows.length && (
                    <tr>
                      <td colSpan={data.days.length + 2} className="px-4 py-8 text-center text-slate-500">
                        За цей період змін немає.
                      </td>
                    </tr>
                  )}
                </tbody>
                {data.rows.length > 0 && (
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-medium text-slate-700">
                    <tr>
                      <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Разом за день</td>
                      {data.days.map((k) => (
                        <td key={k} className="px-2 py-2 text-center tabular-nums">
                          {data.dayTotals[k] ? hm(data.dayTotals[k]) : ""}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums">{hm(data.grandTotalMinutes)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
