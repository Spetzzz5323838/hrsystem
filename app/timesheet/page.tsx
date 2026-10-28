"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { CORRECTION_REASONS } from "../../lib/timesheetReasons";

type Shift = {
  id: number;
  orgNodeId: number;
  storeName: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  closeKind: "TERMINAL" | "MANUAL" | "AUTO" | null;
  editedByName: string | null;
  editReason: string | null;
  cancelled: boolean;
};
type Employee = {
  employmentId: number;
  fullName: string;
  positionTitle: string;
  totalMinutes: number;
  shiftCount: number;
  autoClosedCount: number;
  editedCount: number;
  correctionsCount: number;
  frequentlyCorrected: boolean;
  hasOpenShift: boolean;
  shifts: Shift[];
};
type Data = { month: string; objects: { id: number; name: string; canEdit: boolean }[]; employees: Employee[] };

const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
const dt = (iso: string) => new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
/** Значення для <input type="datetime-local"> — локальний час браузера. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function TimesheetPage() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [objectId, setObjectId] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);

  const [editing, setEditing] = useState<{ shift: Shift } | null>(null);
  const [adding, setAdding] = useState<{ employmentId: number; fullName: string } | null>(null);
  const [startVal, setStartVal] = useState("");
  const [endVal, setEndVal] = useState("");
  const [storeVal, setStoreVal] = useState("");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams({ month });
    if (objectId) q.set("objectId", objectId);
    fetch(`/api/timesheet?${q}`)
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (!r.ok) throw new Error(b.error ?? "Не вдалося завантажити");
        setData(b);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [month, objectId, refresh]);

  const openEdit = (s: Shift) => {
    setEditing({ shift: s });
    setAdding(null);
    setStartVal(toLocalInput(s.startedAt));
    setEndVal(toLocalInput(s.endedAt));
    setReason("");
    setComment("");
    setFormError(null);
  };
  const openAdd = (e: Employee) => {
    setAdding({ employmentId: e.employmentId, fullName: e.fullName });
    setEditing(null);
    setStartVal("");
    setEndVal("");
    setStoreVal(objectId || String(data?.objects.find((o) => o.canEdit)?.id ?? ""));
    setReason("");
    setComment("");
    setFormError(null);
  };

  const save = () => {
    setBusy(true);
    setFormError(null);
    const body = editing
      ? { startedAt: new Date(startVal).toISOString(), endedAt: endVal ? new Date(endVal).toISOString() : null, reason, comment }
      : { employmentId: adding!.employmentId, orgNodeId: Number(storeVal), startedAt: new Date(startVal).toISOString(), endedAt: new Date(endVal).toISOString(), reason, comment };
    fetch(editing ? `/api/shifts/${editing.shift.id}` : "/api/shifts", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (!r.ok) throw new Error(b.error ?? "Не вдалося зберегти");
        setEditing(null);
        setAdding(null);
        setRefresh((x) => x + 1);
      })
      .catch((e) => setFormError(e.message))
      .finally(() => setBusy(false));
  };

  const cancelShift = () => {
    if (!editing) return;
    if (!confirm("Скасувати цю зміну? Вона лишиться в журналі правок, але години не рахуватимуться.")) return;
    setBusy(true);
    setFormError(null);
    fetch(`/api/shifts/${editing.shift.id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, comment }) })
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (!r.ok) throw new Error(b.error ?? "Не вдалося скасувати");
        setEditing(null);
        setRefresh((x) => x + 1);
      })
      .catch((e) => setFormError(e.message))
      .finally(() => setBusy(false));
  };

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

  const canEditAny = data.objects.some((o) => o.canEdit);
  const grandTotal = data.employees.reduce((sum, e) => sum + e.totalMinutes, 0);
  const formOpen = editing || adding;

  return (
    <AppShell active="/timesheet">
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">Табель робочого часу</h2>
          <span className="text-sm text-slate-500">
            {data.employees.length} працівників · разом {hm(grandTotal)} год
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/timesheet/report" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Звіт по днях
          </Link>
          <Link href="/timesheet/journal" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Журнал правок
          </Link>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
          <select value={objectId} onChange={(e) => setObjectId(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Усі магазини</option>
            {data.objects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        {formOpen && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">
              {editing ? `Виправити зміну: ${dt(editing.shift.startedAt)} (${editing.shift.storeName})` : `Додати зміну вручну: ${adding!.fullName}`}
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              {adding && (
                <select value={storeVal} onChange={(e) => setStoreVal(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                  <option value="">— магазин —</option>
                  {data.objects
                    .filter((o) => o.canEdit)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              )}
              <label className="text-xs text-slate-600">
                Початок
                <input type="datetime-local" value={startVal} onChange={(e) => setStartVal(e.target.value)} className="mt-0.5 block rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs text-slate-600">
                Завершення {editing && <span className="text-slate-400">(порожньо — зміна відкрита)</span>}
                <input type="datetime-local" value={endVal} onChange={(e) => setEndVal(e.target.value)} className="mt-0.5 block rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs text-slate-600">
                Причина (обов&rsquo;язково)
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-0.5 block rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                  <option value="">— оберіть причину —</option>
                  {CORRECTION_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grow text-xs text-slate-600">
                Коментар {reason === "OTHER" ? "(обов’язково)" : "(бажано)"}
                <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Що саме сталося" className="mt-0.5 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
              </label>
              <button
                disabled={busy || !startVal || (!!adding && (!endVal || !storeVal)) || !reason || (reason === "OTHER" && comment.trim().length < 3)}
                onClick={save}
                className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Зберегти
              </button>
              {editing && (
                <button
                  disabled={busy || !reason || (reason === "OTHER" && comment.trim().length < 3)}
                  onClick={cancelShift}
                  title="Помилкова чи дубльована зміна: лишається в журналі, години не рахуються"
                  className="rounded border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 disabled:opacity-50"
                >
                  Скасувати зміну
                </button>
              )}
              <button
                onClick={() => {
                  setEditing(null);
                  setAdding(null);
                }}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
              >
                Скасувати
              </button>
            </div>
            {formError && <p className="mt-2 text-sm text-rose-700">{formError}</p>}
          </div>
        )}

        <div className="rounded-md border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Працівник</th>
                <th className="px-4 py-2 font-medium">Посада</th>
                <th className="px-4 py-2 text-right font-medium">Змін</th>
                <th className="px-4 py-2 text-right font-medium">Годин</th>
                <th className="px-4 py-2 font-medium">Увага</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.employees.map((e) => (
                <Fragment key={e.employmentId}>
                  <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(openId === e.employmentId ? null : e.employmentId)}>
                    <td className="px-4 py-2 font-medium text-slate-900">{e.fullName}</td>
                    <td className="px-4 py-2 text-slate-600">{e.positionTitle}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{e.shiftCount}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{hm(e.totalMinutes)}</td>
                    <td className="px-4 py-2 text-xs">
                      {e.hasOpenShift && <span className="mr-1 rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">відкрита зміна</span>}
                      {e.autoClosedCount > 0 && <span className="mr-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">автозакрито: {e.autoClosedCount}</span>}
                      {e.editedCount > 0 && <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">виправлено: {e.editedCount}</span>}
                      {e.frequentlyCorrected && (
                        <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700" title="Багато правок за місяць: не відмічається чи проблема з терміналом">
                          часто виправляється: {e.correctionsCount}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-slate-400">{openId === e.employmentId ? "▲" : "▼"}</td>
                  </tr>
                  {openId === e.employmentId && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50 px-4 py-2">
                        <table className="w-full text-xs">
                          <tbody className="divide-y divide-slate-200">
                            {e.shifts.map((s) => (
                              <tr key={s.id} className={s.cancelled ? "text-slate-400 line-through" : ""}>
                                <td className="py-1 text-slate-700">
                                  {dt(s.startedAt)} — {s.endedAt ? dt(s.endedAt) : <span className="text-sky-700">триває</span>}
                                </td>
                                <td className="py-1 tabular-nums text-slate-700">{hm(s.minutes)}</td>
                                <td className="py-1 text-slate-500">{s.storeName}</td>
                                <td className="py-1 text-slate-500">
                                  {s.cancelled && <span className="no-underline">скасовано</span>}
                                  {!s.cancelled && s.closeKind === "AUTO" && <span className="text-amber-800">закрито автоматично (6 год)</span>}
                                  {!s.cancelled && s.closeKind === "MANUAL" && <span>виправлено вручну</span>}
                                  {s.editedByName && (
                                    <span className="ml-1 text-slate-400">
                                      · {s.editedByName}: {s.editReason}
                                    </span>
                                  )}
                                </td>
                                <td className="py-1 text-right">
                                  {data.objects.find((o) => o.id === s.orgNodeId)?.canEdit && (
                                    <button onClick={() => openEdit(s)} className="text-slate-600 hover:text-slate-900">
                                      виправити
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {canEditAny && (
                          <button onClick={() => openAdd(e)} className="mt-2 text-xs text-slate-600 hover:text-slate-900">
                            + додати зміну вручну
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!data.employees.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    За цей місяць змін немає.
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
