"use client";

import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";

type StaffingRow = { positionProfileId: number; title: string; planned: number; actual: number; gap: number };
type StaffingObject = {
  objectId: number;
  objectName: string;
  roster: StaffingRow[];
  totalPlanned: number;
  totalActual: number;
  totalGap: number;
};

type TurnoverReasonRow = { code: string; name: string; count: number };
type TurnoverObjectRow = { objectId: number; objectName: string; terminated: number; currentHeadcount: number; ratePercent: number };
type TurnoverData = {
  months: number;
  totalTerminated: number;
  overallRatePercent: number;
  byReason: TurnoverReasonRow[];
  byObject: TurnoverObjectRow[];
};

type ExpiringRow = {
  personId: number;
  fullName: string;
  positionTitle: string;
  objectId: number;
  objectName: string;
  competencyName: string;
  validUntil: string;
  state: "expired" | "expiring";
  daysLeft: number;
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
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

export default function AnalyticsPage() {
  const [staffing, setStaffing] = useState<StaffingObject[] | null>(null);
  const [turnover, setTurnover] = useState<TurnoverData | null>(null);
  const [turnoverMonths, setTurnoverMonths] = useState(12);
  const [expiring, setExpiring] = useState<ExpiringRow[] | null>(null);
  const [months, setMonths] = useState(3);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics/staffing")
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        setStaffing(b.objects);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    fetch(`/api/analytics/turnover?months=${turnoverMonths}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        setTurnover(b);
      })
      .catch((e) => setError(e.message));
  }, [turnoverMonths]);

  useEffect(() => {
    fetch(`/api/analytics/competency-expiry?months=${months}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        setExpiring(b.rows);
      })
      .catch((e) => setError(e.message));
  }, [months]);

  if (error) {
    return (
      <AppShell active="/analytics">
        <div className="text-sm text-rose-700">{error}</div>
      </AppShell>
    );
  }

  const totalVacancies = staffing?.reduce((sum, o) => sum + o.roster.filter((r) => r.gap > 0).reduce((s, r) => s + r.gap, 0), 0) ?? 0;
  const objectsWithVacancies = staffing?.filter((o) => o.roster.some((r) => r.gap > 0)).length ?? 0;

  return (
    <AppShell active="/analytics">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Аналітика</h2>

        <Section
          title="Укомплектованість"
          right={
            staffing && (
              <span className="text-xs text-slate-500">
                {totalVacancies > 0 ? `${totalVacancies} вакансій на ${objectsWithVacancies} об'єктах` : "усі об'єкти укомплектовані"}
              </span>
            )
          }
        >
          {!staffing && <p className="px-4 py-6 text-sm text-slate-500">Завантаження…</p>}
          {staffing && !staffing.length && <p className="px-4 py-6 text-sm text-slate-500">Немає видимих об'єктів.</p>}
          {staffing && !!staffing.length && (
            <div className="divide-y divide-slate-100">
              {staffing.map((obj) => (
                <div key={obj.objectId} className="px-4 py-3">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-medium text-slate-900">{obj.objectName}</p>
                    <p className="text-xs text-slate-500">
                      {obj.totalActual} з {obj.totalPlanned}
                      {obj.totalGap > 0 && <span className="ml-1 font-medium text-rose-600">(бракує {obj.totalGap})</span>}
                    </p>
                  </div>
                  <table className="mt-2 w-full text-xs">
                    <tbody className="divide-y divide-slate-50">
                      {obj.roster.map((r) => (
                        <tr key={r.positionProfileId}>
                          <td className="py-1 text-slate-700">{r.title}</td>
                          <td className="w-20 py-1 text-right tabular-nums text-slate-500">
                            {r.actual} / {r.planned}
                          </td>
                          <td className="w-24 py-1 text-right">
                            {r.gap > 0 && <span className="rounded bg-rose-50 px-1.5 py-0.5 font-medium text-rose-700">бракує {r.gap}</span>}
                            {r.gap < 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">надлишок {-r.gap}</span>}
                          </td>
                        </tr>
                      ))}
                      {!obj.roster.length && (
                        <tr>
                          <td colSpan={3} className="py-2 text-slate-400">
                            Немає штатних одиниць.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Плинність"
          right={
            <select
              value={turnoverMonths}
              onChange={(e) => setTurnoverMonths(Number(e.target.value))}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value={3}>3 місяці</option>
              <option value={6}>6 місяців</option>
              <option value={12}>12 місяців</option>
            </select>
          }
        >
          {!turnover && <p className="px-4 py-6 text-sm text-slate-500">Завантаження…</p>}
          {turnover && (
            <div className="px-4 py-3">
              <p className="text-sm text-slate-700">
                За {turnover.months} міс.: <span className="font-semibold text-slate-900">{turnover.totalTerminated}</span> звільнень,
                плинність <span className="font-semibold text-slate-900">{turnover.overallRatePercent}%</span>
              </p>

              {!turnover.totalTerminated ? (
                <p className="mt-2 text-sm text-slate-500">За обраний період звільнень не було.</p>
              ) : (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-500">За причиною</p>
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-50">
                        {turnover.byReason.map((r) => (
                          <tr key={r.code}>
                            <td className="py-1 text-slate-700">{r.name}</td>
                            <td className="w-10 py-1 text-right tabular-nums text-slate-500">{r.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-500">За об&rsquo;єктом</p>
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-50">
                        {turnover.byObject
                          .filter((o) => o.terminated > 0)
                          .map((o) => (
                            <tr key={o.objectId}>
                              <td className="py-1 text-slate-700">{o.objectName}</td>
                              <td className="w-10 py-1 text-right tabular-nums text-slate-500">{o.terminated}</td>
                              <td className="w-14 py-1 text-right tabular-nums text-slate-400">{o.ratePercent}%</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section
          title="Строки компетенцій, що спливають"
          right={
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value={1}>1 місяць</option>
              <option value={3}>3 місяці</option>
              <option value={6}>6 місяців</option>
            </select>
          }
        >
          {!expiring && <p className="px-4 py-6 text-sm text-slate-500">Завантаження…</p>}
          {expiring && !expiring.length && <p className="px-4 py-6 text-sm text-slate-500">Нічого не спливає в обраний період.</p>}
          {expiring && !!expiring.length && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-2 text-left font-medium">Працівник</th>
                  <th className="px-3 py-2 text-left font-medium">Об&rsquo;єкт</th>
                  <th className="px-3 py-2 text-left font-medium">Компетенція</th>
                  <th className="px-3 py-2 text-right font-medium">Строк</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expiring.map((row, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2">
                      <p className="text-slate-900">{row.fullName}</p>
                      <p className="text-xs text-slate-500">{row.positionTitle}</p>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.objectName}</td>
                    <td className="px-3 py-2 text-slate-600">{row.competencyName}</td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          row.state === "expired" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {row.state === "expired" ? `протерміновано ${fmt(row.validUntil)}` : `до ${fmt(row.validUntil)} (${row.daysLeft} дн.)`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
