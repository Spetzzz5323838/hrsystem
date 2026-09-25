"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import AppShell from "../components/AppShell";

type EmployeeRow = {
  employmentId: number;
  personId: number;
  fullName: string;
  phone: string;
  positionTitle: string;
  objectId: number;
  objectName: string;
  status: string;
  competencyDone: number;
  competencyTotal: number;
  curatorName: string | null;
};

type ListResponse = { employees: EmployeeRow[]; objects: { id: number; name: string }[]; total: number };

type PendingHireRow = {
  id: number;
  fullName: string;
  birthDate: string;
  phone: string;
  email: string | null;
  objectId: number;
  objectName: string;
  createdAt: string;
};

type StaffUnitOption = { id: number; positionTitle: string; objectName: string };

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  REGISTERED: { label: "Зареєстрований", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  ACTIVATED: { label: "Активовано", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  DOCUMENTS_PENDING: { label: "Оформлення", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  TRAINEE: { label: "Стажер", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  READY_FOR_ATTESTATION: { label: "На атестацію", cls: "bg-amber-100 text-amber-900 border-amber-400" },
  ACTIVE: { label: "Працює", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  TRANSFER_PENDING: { label: "Переводиться", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  FROZEN: { label: "Заморожений", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  TERMINATION_STARTED: { label: "Звільняється", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  TERMINATED: { label: "Звільнений", cls: "bg-slate-100 text-slate-500 border-slate-300" },
};

const AVATAR_BG = ["bg-slate-700", "bg-teal-700", "bg-indigo-700", "bg-amber-700", "bg-rose-700", "bg-emerald-700"];

function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const parts = name.split(" ");
  const ini = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  const bg = AVATAR_BG[name.length % AVATAR_BG.length];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-medium text-white ${bg}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {ini}
    </span>
  );
}

function Badge({ status }: { status: string }) {
  const meta = STATUS_LABELS[status] ?? { label: status, cls: "bg-slate-100 text-slate-700 border-slate-300" };
  return <span className={`inline-flex items-center border px-2 py-0.5 text-xs font-medium rounded ${meta.cls}`}>{meta.label}</span>;
}

// Сортування таблиці кліком по заголовку (2026-09-25) — той самий
// механізм, що в app/catalog/page.tsx.
type SortField = "fullName" | "positionTitle" | "objectName" | "status" | "curatorName" | "competency";
type SortState = { field: SortField; dir: "asc" | "desc" };

function toggleSort(current: SortState, field: SortField): SortState {
  if (current.field === field) return { field, dir: current.dir === "asc" ? "desc" : "asc" };
  return { field, dir: "asc" };
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "uk");
}

function SortTh({ label, field, sort, onSort }: { label: string; field: SortField; sort: SortState; onSort: (field: SortField) => void }) {
  const active = sort.field === field;
  return (
    <th onClick={() => onSort(field)} className="cursor-pointer select-none px-4 py-2 font-medium hover:text-slate-800">
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="w-2.5 text-[10px] text-slate-400">{active ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
      </span>
    </th>
  );
}

export default function EmployeesPage() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [objectFilter, setObjectFilter] = useState("");
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sort, setSort] = useState<SortState>({ field: "fullName", dir: "asc" });

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (statusFilter) params.set("status", statusFilter);
    if (objectFilter) params.set("objectId", objectFilter);

    fetch(`/api/employees?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "Потрібно увійти в систему" : "Не вдалося завантажити список");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [q, statusFilter, objectFilter, refreshKey]);

  // ── Нові заявки (реєстрація по QR, ще без посади — PendingHire) ──
  const [pendingHires, setPendingHires] = useState<PendingHireRow[] | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [staffUnits, setStaffUnits] = useState<StaffUnitOption[]>([]);
  const [placingId, setPlacingId] = useState<number | null>(null);
  const [placingStaffUnitId, setPlacingStaffUnitId] = useState("");
  const [placingSubmitting, setPlacingSubmitting] = useState(false);
  const [placingError, setPlacingError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pending-hires")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Не вдалося завантажити заявки"))))
      .then((body) => {
        setPendingHires(body.pendingHires);
        setPendingError(null);
      })
      .catch((e) => setPendingError(e.message));
    fetch("/api/staff-units")
      .then((r) => (r.ok ? r.json() : []))
      .then(setStaffUnits)
      .catch(() => {});
  }, [refreshKey]);

  const startPlacing = (id: number) => {
    setPlacingId(id);
    setPlacingStaffUnitId("");
    setPlacingError(null);
  };

  const confirmPlacing = (id: number) => {
    if (!placingStaffUnitId) return;
    setPlacingSubmitting(true);
    fetch(`/api/pending-hires/${id}/place`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffUnitId: Number(placingStaffUnitId) }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося призначити посаду");
        setPlacingId(null);
        setRefreshKey((k) => k + 1);
      })
      .catch((e) => setPlacingError(e.message))
      .finally(() => setPlacingSubmitting(false));
  };

  if (error) {
    return (
      <AppShell active="/employees">
        <div className="text-sm text-rose-700">{error}</div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell active="/employees">
        <div className="text-sm text-slate-500">Завантаження…</div>
      </AppShell>
    );
  }

  return (
    <AppShell active="/employees">
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Працівники</h2>
          <span className="text-sm text-slate-500">
            {data.employees.length} з {data.total}
          </span>
        </div>

        {!!pendingHires?.length && (
          <div className="overflow-hidden rounded-md border border-amber-300 bg-amber-50">
            <div className="border-b border-amber-200 px-4 py-2 text-sm font-medium text-amber-900">
              Нові заявки ({pendingHires.length}) — зареєстровані по QR, ще без посади
            </div>
            {pendingError && <p className="px-4 py-2 text-sm text-rose-700">{pendingError}</p>}
            <table className="w-full text-sm">
              <tbody className="divide-y divide-amber-100">
                {pendingHires.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{p.fullName}</p>
                      <p className="text-xs tabular-nums text-slate-500">
                        {p.phone}
                        {p.email ? ` · ${p.email}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{p.objectName}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{new Date(p.createdAt).toLocaleString("uk-UA")}</td>
                    <td className="px-4 py-2 text-right">
                      {placingId === p.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <select
                            value={placingStaffUnitId}
                            onChange={(e) => setPlacingStaffUnitId(e.target.value)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="">— штатна одиниця —</option>
                            {staffUnits.map((su) => (
                              <option key={su.id} value={su.id}>
                                {su.positionTitle} · {su.objectName}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => confirmPlacing(p.id)}
                            disabled={!placingStaffUnitId || placingSubmitting}
                            className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                          >
                            Підтвердити
                          </button>
                          <button onClick={() => setPlacingId(null)} className="text-xs text-slate-500 hover:text-slate-800">
                            Скасувати
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startPlacing(p.id)}
                          className="rounded border border-amber-400 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                        >
                          Призначити посаду
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {placingError && <p className="px-4 py-2 text-sm text-rose-700">{placingError}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Прізвище або телефон"
              className="w-64 rounded border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm placeholder-slate-400 focus:border-slate-800 focus:outline-none"
            />
          </div>
          <select
            value={objectFilter}
            onChange={(e) => setObjectFilter(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Усі об&rsquo;єкти</option>
            {data.objects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Усі статуси</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden border border-slate-200 bg-white rounded-md">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <SortTh label="Працівник" field="fullName" sort={sort} onSort={(f) => setSort((s) => toggleSort(s, f))} />
                <SortTh label="Посада" field="positionTitle" sort={sort} onSort={(f) => setSort((s) => toggleSort(s, f))} />
                <SortTh label="Місце роботи" field="objectName" sort={sort} onSort={(f) => setSort((s) => toggleSort(s, f))} />
                <SortTh label="Статус" field="status" sort={sort} onSort={(f) => setSort((s) => toggleSort(s, f))} />
                <SortTh label="Куратор" field="curatorName" sort={sort} onSort={(f) => setSort((s) => toggleSort(s, f))} />
                <SortTh label="Компетенції" field="competency" sort={sort} onSort={(f) => setSort((s) => toggleSort(s, f))} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...data.employees]
                .sort((a, b) => {
                  const value = (r: EmployeeRow) =>
                    sort.field === "status"
                      ? (STATUS_LABELS[r.status]?.label ?? r.status)
                      : sort.field === "competency"
                        ? r.competencyTotal > 0
                          ? r.competencyDone / r.competencyTotal
                          : -1
                        : r[sort.field];
                  return (sort.dir === "asc" ? 1 : -1) * compareValues(value(a), value(b));
                })
                .map((e) => (
                <tr key={e.employmentId} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/employees/${e.employmentId}`} className="flex items-center gap-2.5">
                      <Avatar name={e.fullName} />
                      <div>
                        <p className="font-medium text-slate-900">{e.fullName}</p>
                        <p className="text-xs tabular-nums text-slate-400">{e.phone}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{e.positionTitle}</td>
                  <td className="px-4 py-2 text-slate-600">{e.objectName}</td>
                  <td className="px-4 py-2">
                    <Badge status={e.status} />
                  </td>
                  <td className="px-4 py-2 text-slate-600">{e.curatorName ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-2">
                    {e.competencyTotal > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded bg-slate-200">
                          <div
                            className={`h-1.5 rounded ${e.competencyDone === e.competencyTotal ? "bg-emerald-500" : "bg-amber-500"}`}
                            style={{ width: `${(e.competencyDone / e.competencyTotal) * 100}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-xs text-slate-500">
                          {e.competencyDone}/{e.competencyTotal}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">немає в довіднику</span>
                    )}
                  </td>
                </tr>
              ))}
              {!data.employees.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                    Нікого не знайдено.
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
