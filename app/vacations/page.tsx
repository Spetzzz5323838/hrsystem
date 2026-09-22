"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import AppShell from "../components/AppShell";

type PendingRow = {
  id: number;
  employmentId: number;
  fullName: string;
  positionTitle: string;
  type: "ANNUAL" | "UNPAID";
  fromDate: string;
  toDate: string;
  isOutOfSchedule: boolean;
  hasConflict: boolean;
  isCriticalPosition: boolean;
  requiresEscalation: boolean;
  conflictNote: string | null;
};

type CalendarRow = { employmentId: number; fromDate: string; toDate: string; status: "PENDING" | "APPROVED" };
type EmployeeRow = { employmentId: number; fullName: string; positionTitle: string };

type Data = { objects: { id: number; name: string }[]; employees: EmployeeRow[]; pending: PendingRow[]; calendar: CalendarRow[] };

const TYPE_LABELS: Record<string, string> = { ANNUAL: "Щорічна", UNPAID: "За свій рахунок" };

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
}

function Avatar({ name }: { name: string }) {
  const parts = name.split(" ");
  const ini = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-white">{ini}</span>;
}

function Section({ title, right, children }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function VacationsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [objectId, setObjectId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [dateEdits, setDateEdits] = useState<Record<number, { fromDate: string; toDate: string }>>({});

  const load = (oid?: number) => {
    const url = oid ? `/api/vacations?objectId=${oid}` : "/api/vacations";
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити");
        return r.json();
      })
      .then((d: Data) => {
        setData(d);
        if (!oid && d.objects[0]) setObjectId(d.objects[0].id);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = (id: number, decision: "APPROVED" | "REJECTED", dates?: { fromDate: string; toDate: string }) => {
    const rejectReason = decision === "REJECTED" ? prompt("Причина відхилення:") : undefined;
    if (decision === "REJECTED" && !rejectReason) return;

    setBusyId(id);
    fetch(`/api/vacation-requests/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, rejectReason, ...(dates ?? {}) }),
    })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        load(objectId ?? undefined);
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusyId(null));
  };

  if (error) {
    return (
      <AppShell active="/vacations">
        <div className="text-sm text-rose-700">{error}</div>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell active="/vacations">
        <div className="text-sm text-slate-500">Завантаження…</div>
      </AppShell>
    );
  }

  const { year, month } = cursor;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthStart = new Date(Date.UTC(year, month, 1));

  const vacOn = (employmentId: number, day: number) => {
    const dt = new Date(Date.UTC(year, month, day));
    return data.calendar.find((v) => v.employmentId === employmentId && new Date(v.fromDate) <= dt && new Date(v.toDate) >= dt);
  };

  return (
    <AppShell active="/vacations">
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Відпустки</h2>
          <select
            value={objectId ?? ""}
            onChange={(e) => {
              const oid = Number(e.target.value);
              setObjectId(oid);
              load(oid);
            }}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            {data.objects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        {data.pending.length > 0 && (
          <Section title="Заявки на погодження">
            <div className="divide-y divide-slate-100">
              {data.pending.map((p) => {
                const edit = dateEdits[p.id] ?? { fromDate: p.fromDate.slice(0, 10), toDate: p.toDate.slice(0, 10) };
                const datesChanged = edit.fromDate !== p.fromDate.slice(0, 10) || edit.toDate !== p.toDate.slice(0, 10);
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Avatar name={p.fullName} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {p.fullName} · {p.positionTitle}
                      </p>
                      <p className="text-xs text-slate-500">
                        {TYPE_LABELS[p.type]}: {fmt(p.fromDate)} — {fmt(p.toDate)}
                      </p>
                      {p.conflictNote && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                          <AlertTriangle size={12} /> {p.conflictNote}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <span>Погодити на:</span>
                        <input
                          type="date"
                          value={edit.fromDate}
                          onChange={(e) => setDateEdits((prev) => ({ ...prev, [p.id]: { ...edit, fromDate: e.target.value } }))}
                          className="rounded border border-slate-300 px-1.5 py-0.5"
                        />
                        <span>—</span>
                        <input
                          type="date"
                          value={edit.toDate}
                          onChange={(e) => setDateEdits((prev) => ({ ...prev, [p.id]: { ...edit, toDate: e.target.value } }))}
                          className="rounded border border-slate-300 px-1.5 py-0.5"
                        />
                        {datesChanged && <span className="text-amber-700">змінено</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={busyId === p.id}
                        onClick={() => decide(p.id, "APPROVED", edit)}
                        className="rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        Погодити
                      </button>
                      <button
                        disabled={busyId === p.id}
                        onClick={() => decide(p.id, "REJECTED")}
                        className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Відхилити
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        <Section
          title={
            <span className="flex items-center gap-2">
              <button
                onClick={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Попередній місяць"
              >
                <ChevronLeft size={16} />
              </button>
              <span>Календар · {monthStart.toLocaleDateString("uk-UA", { month: "long", year: "numeric" })}</span>
              <button
                onClick={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Наступний місяць"
              >
                <ChevronRight size={16} />
              </button>
            </span>
          }
          right={
            <div className="flex gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-emerald-500" /> погоджено
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-amber-400" /> на погодженні
              </span>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium text-slate-500">Працівник</th>
                  {days.map((n) => {
                    const wd = new Date(Date.UTC(year, month, n)).getUTCDay();
                    return (
                      <th key={n} className={`w-6 py-2 text-center font-normal ${wd === 0 || wd === 6 ? "bg-slate-100 text-slate-400" : "text-slate-500"}`}>
                        {n}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.employees.map((e) => (
                  <tr key={e.employmentId}>
                    <td className="sticky left-0 bg-white px-3 py-1.5 text-slate-800">{e.fullName.split(" ").slice(0, 2).join(" ")}</td>
                    {days.map((n) => {
                      const v = vacOn(e.employmentId, n);
                      const wd = new Date(Date.UTC(year, month, n)).getUTCDay();
                      return (
                        <td key={n} className={`h-7 ${wd === 0 || wd === 6 ? "bg-slate-50" : ""}`}>
                          {v && <div className={`mx-px h-4 rounded-sm ${v.status === "APPROVED" ? "bg-emerald-500" : "bg-amber-400"}`} />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!data.employees.length && (
                  <tr>
                    <td colSpan={days.length + 1} className="px-4 py-8 text-center text-slate-500">
                      У цьому об&rsquo;єкті немає працівників.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
