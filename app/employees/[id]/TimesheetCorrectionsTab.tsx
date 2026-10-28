"use client";

import { useEffect, useState } from "react";

type Row = {
  id: number;
  createdAt: string;
  kind: string;
  storeName: string;
  shiftDate: string;
  beforeStartedAt: string | null;
  beforeEndedAt: string | null;
  afterStartedAt: string | null;
  afterEndedAt: string | null;
  deltaMinutes: number;
  reasonLabel: string;
  comment: string | null;
  actorName: string;
  periodClosed: boolean;
};

const KIND: Record<string, string> = { EDIT: "Виправлення", CREATE: "Додано вручну", CANCEL: "Скасовано", AUTO_CLOSE: "Автозакриття" };
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) : "…");
const range = (a: string | null, b: string | null) => (a ? `${time(a)}–${b ? time(b) : "…"}` : "—");
const hm = (m: number) => `${m < 0 ? "−" : m > 0 ? "+" : ""}${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, "0")}`;

/** Вкладка «Правки табеля» в картці працівника: усі корекції його робочого часу за 12 місяців. */
export default function TimesheetCorrectionsTab({ employmentId }: { employmentId: string | number }) {
  const [rows, setRows] = useState<Row[] | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/employees/${employmentId}/timesheet-corrections`)
      .then((r) => (r.ok ? r.json() : { rows: null }))
      .then((b) => setRows(b.rows))
      .catch(() => setRows(null));
  }, [employmentId]);

  if (rows === undefined) return <p className="text-sm text-slate-500">Завантаження…</p>;
  if (rows === null) return <p className="rounded-md border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">Немає доступу до табеля цього працівника.</p>;
  if (!rows.length) return <p className="rounded-md border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">Правок табеля за останні 12 місяців немає.</p>;

  const manual = rows.filter((r) => r.kind !== "AUTO_CLOSE").length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        За 12 місяців: правок вручну — <b>{manual}</b>, автозакриттів — <b>{rows.length - manual}</b>.
      </p>
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Виправлено</th>
              <th className="px-3 py-2 font-medium">Зміна</th>
              <th className="px-3 py-2 font-medium">Було → стало</th>
              <th className="px-3 py-2 text-right font-medium">Різниця</th>
              <th className="px-3 py-2 font-medium">Причина</th>
              <th className="px-3 py-2 font-medium">Хто</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{new Date(r.createdAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                  {new Date(r.shiftDate).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}
                  <span className="block text-xs text-slate-400">
                    {KIND[r.kind] ?? r.kind} · {r.storeName}
                  </span>
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
