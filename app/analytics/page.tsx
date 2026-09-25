"use client";

import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";

type FunnelStageCount = { status: string; label: string; count: number };
type FunnelStageDuration = { key: string; label: string; avgHours: number | null; sampleSize: number };
type FunnelData = {
  months: number;
  totalStarted: number;
  currentByStage: FunnelStageCount[];
  completed: number;
  abandoned: number;
  stageDurations: FunnelStageDuration[];
  totalDurationHours: number | null;
  totalDurationSampleSize: number;
};

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

type SlaByObjectRow = { objectId: number; objectName: string; onTime: number; late: number; currentlyOverdue: number; total: number; onTimePercent: number };
type SlaByRoleRow = { role: string; onTime: number; late: number; currentlyOverdue: number; total: number; onTimePercent: number };
type SlaData = {
  months: number;
  onTime: number;
  late: number;
  currentlyOverdue: number;
  total: number;
  onTimePercent: number;
  escalated: number;
  byObject: SlaByObjectRow[];
  byRole: SlaByRoleRow[];
};

const SLA_ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Працівник",
  CURATOR: "Куратор",
  STORE_ADMIN: "Адміністратор магазину",
  ONEC_ADMIN: "Оператор 1С",
  ACCOUNTANT: "Бухгалтер",
  AUDITOR: "Ревізор",
  COO: "Керівництво",
  SYSADMIN: "Системний адміністратор",
  SYSTEM: "Система (авто)",
};

type RatingAuthorRow = {
  authorId: number;
  authorName: string;
  totalEvents: number;
  positiveCount: number;
  negativeCount: number;
  dominantKey: string | null;
  dominantSharePercent: number;
};
type RatingAuthorData = {
  months: number;
  onlyNegative: RatingAuthorRow[];
  noRatings: { employmentId: number; fullName: string }[];
  sameEverything: RatingAuthorRow[];
};
type RatingCategoryOption = { code: string; name: string; side: "POS" | "NEG" };

const RATING_KEY_FALLBACK: Record<string, string> = {
  REPRIMAND: "Догана",
  AWARD: "Номінація",
  POSITIVE: "Позитив (без приводу)",
  NEGATIVE: "Негатив (без приводу)",
};

type CuratorRow = {
  curatorEmploymentId: number;
  curatorName: string;
  objectName: string;
  currentlyTraining: number;
  graduatedInPeriod: number;
  hasMentorBadge: boolean;
};
type CuratorData = { months: number; rows: CuratorRow[] };

type RatingSummaryNodeRow = {
  id: number;
  name: string;
  positiveCount: number;
  negativeCount: number;
  reprimandCount: number;
  awardCount: number;
  netScore: number;
};
type RatingSummaryPersonRow = {
  personId: number;
  fullName: string;
  locationName: string;
  positiveCount: number;
  negativeCount: number;
  reprimandCount: number;
  awardCount: number;
  netScore: number;
};
type RatingSummaryData = {
  months: number;
  byObject: RatingSummaryNodeRow[];
  byCluster: RatingSummaryNodeRow[];
  topPositive: RatingSummaryPersonRow[];
  topNegative: RatingSummaryPersonRow[];
};

function RatingSummaryTable({ rows }: { rows: RatingSummaryNodeRow[] }) {
  if (!rows.length) return <p className="text-sm text-slate-400">Немає даних.</p>;
  return (
    <table className="w-full text-xs">
      <tbody className="divide-y divide-slate-50">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="py-1 text-slate-700">{r.name}</td>
            <td className="w-28 py-1 text-right tabular-nums text-slate-500">
              +{r.positiveCount}/−{r.negativeCount}
              {r.awardCount > 0 && ` · 🏆${r.awardCount}`}
              {r.reprimandCount > 0 && ` · ⚠${r.reprimandCount}`}
            </td>
            <td className={`w-16 py-1 text-right tabular-nums font-medium ${r.netScore >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {r.netScore > 0 ? "+" : ""}
              {r.netScore}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RatingSummaryPersonTable({ rows, positive }: { rows: RatingSummaryPersonRow[]; positive: boolean }) {
  if (!rows.length) return <p className="text-sm text-slate-400">Немає даних.</p>;
  return (
    <table className="w-full text-xs">
      <tbody className="divide-y divide-slate-50">
        {rows.map((r) => (
          <tr key={r.personId}>
            <td className="py-1 text-slate-700">
              {r.fullName} <span className="text-slate-400">— {r.locationName}</span>
            </td>
            <td className={`w-16 py-1 text-right tabular-nums font-medium ${positive ? "text-emerald-700" : "text-rose-700"}`}>
              {r.netScore > 0 ? "+" : ""}
              {r.netScore}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

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

function fmtHours(hours: number): string {
  if (hours < 48) return `${Math.round(hours * 10) / 10} год`;
  return `${Math.round((hours / 24) * 10) / 10} дн.`;
}

function ratingKeyLabel(key: string | null, categories: RatingCategoryOption[]): string {
  if (!key) return "—";
  return categories.find((c) => c.code === key)?.name ?? RATING_KEY_FALLBACK[key] ?? key;
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
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [funnelMonths, setFunnelMonths] = useState(6);
  const [staffing, setStaffing] = useState<StaffingObject[] | null>(null);
  const [turnover, setTurnover] = useState<TurnoverData | null>(null);
  const [turnoverMonths, setTurnoverMonths] = useState(12);
  const [sla, setSla] = useState<SlaData | null>(null);
  const [slaMonths, setSlaMonths] = useState(3);
  const [ratingAuthors, setRatingAuthors] = useState<RatingAuthorData | null>(null);
  const [ratingMonths, setRatingMonths] = useState(3);
  const [ratingCategories, setRatingCategories] = useState<RatingCategoryOption[]>([]);
  const [expiring, setExpiring] = useState<ExpiringRow[] | null>(null);
  const [months, setMonths] = useState(3);
  const [curators, setCurators] = useState<CuratorData | null>(null);
  const [curatorMonths, setCuratorMonths] = useState(6);
  const [ratingSummary, setRatingSummary] = useState<RatingSummaryData | null>(null);
  const [ratingSummaryMonths, setRatingSummaryMonths] = useState(3);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/analytics/hiring-funnel?months=${funnelMonths}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        setFunnel(b);
      })
      .catch((e) => setError(e.message));
  }, [funnelMonths]);

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
    fetch(`/api/analytics/sla-discipline?months=${slaMonths}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        setSla(b);
      })
      .catch((e) => setError(e.message));
  }, [slaMonths]);

  useEffect(() => {
    fetch("/api/rating-categories")
      .then((r) => r.json())
      .then((b) => setRatingCategories(b))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/analytics/rating-authors?months=${ratingMonths}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        setRatingAuthors(b);
      })
      .catch((e) => setError(e.message));
  }, [ratingMonths]);

  useEffect(() => {
    fetch(`/api/analytics/competency-expiry?months=${months}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        setExpiring(b.rows);
      })
      .catch((e) => setError(e.message));
  }, [months]);

  useEffect(() => {
    fetch(`/api/analytics/curators?months=${curatorMonths}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        setCurators(b);
      })
      .catch((e) => setError(e.message));
  }, [curatorMonths]);

  useEffect(() => {
    fetch(`/api/analytics/rating-summary?months=${ratingSummaryMonths}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        setRatingSummary(b);
      })
      .catch((e) => setError(e.message));
  }, [ratingSummaryMonths]);

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
          title="Воронка найму"
          right={
            <select
              value={funnelMonths}
              onChange={(e) => setFunnelMonths(Number(e.target.value))}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value={1}>1 місяць</option>
              <option value={3}>3 місяці</option>
              <option value={6}>6 місяців</option>
              <option value={12}>12 місяців</option>
            </select>
          }
        >
          {!funnel && <p className="px-4 py-6 text-sm text-slate-500">Завантаження…</p>}
          {funnel && !funnel.totalStarted && <p className="px-4 py-6 text-sm text-slate-500">За обраний період нових онбордингів не було.</p>}
          {funnel && !!funnel.totalStarted && (
            <div className="px-4 py-3">
              <p className="text-sm text-slate-700">
                За {funnel.months} міс. стартувало <span className="font-semibold text-slate-900">{funnel.totalStarted}</span>, завершено{" "}
                <span className="font-semibold text-emerald-700">{funnel.completed}</span>
                {funnel.abandoned > 0 && (
                  <>
                    , перервано звільненням <span className="font-semibold text-rose-700">{funnel.abandoned}</span>
                  </>
                )}
              </p>

              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">Зараз на етапі (не завершені)</p>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-50">
                      {funnel.currentByStage
                        .filter((s) => s.count > 0)
                        .map((s) => (
                          <tr key={s.status}>
                            <td className="py-1 text-slate-700">{s.label}</td>
                            <td className="w-10 py-1 text-right tabular-nums text-slate-500">{s.count}</td>
                          </tr>
                        ))}
                      {!funnel.currentByStage.some((s) => s.count > 0) && (
                        <tr>
                          <td className="py-1 text-slate-400">Немає активних онбордингів.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">
                    Середній час по етапах
                    <span className="ml-1 font-normal text-slate-400">(тільки процеси з 12.09.2026 — раніше час переходів не фіксувався)</span>
                  </p>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-50">
                      {funnel.stageDurations.map((d) => (
                        <tr key={d.key}>
                          <td className="py-1 text-slate-700">{d.label}</td>
                          <td className="w-24 py-1 text-right tabular-nums text-slate-500">
                            {d.avgHours != null ? fmtHours(d.avgHours) : "—"}
                          </td>
                        </tr>
                      ))}
                      {funnel.totalDurationHours != null && (
                        <tr className="font-medium">
                          <td className="py-1 text-slate-900">Загалом реєстрація → активний</td>
                          <td className="w-24 py-1 text-right tabular-nums text-slate-900">{fmtHours(funnel.totalDurationHours)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Section>

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
          title="Дисципліна за SLA"
          right={
            <select
              value={slaMonths}
              onChange={(e) => setSlaMonths(Number(e.target.value))}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value={1}>1 місяць</option>
              <option value={3}>3 місяці</option>
              <option value={6}>6 місяців</option>
              <option value={12}>12 місяців</option>
            </select>
          }
        >
          {!sla && <p className="px-4 py-6 text-sm text-slate-500">Завантаження…</p>}
          {sla && !sla.total && !sla.currentlyOverdue && (
            <p className="px-4 py-6 text-sm text-slate-500">За обраний період немає пунктів чек-листа з нормативом виконання.</p>
          )}
          {sla && (!!sla.total || !!sla.currentlyOverdue) && (
            <div className="px-4 py-3">
              <p className="text-sm text-slate-700">
                За {sla.months} міс. виконано вчасно <span className="font-semibold text-emerald-700">{sla.onTime}</span>, з
                протермінуванням <span className="font-semibold text-rose-700">{sla.late}</span> (
                <span className="font-semibold text-slate-900">{sla.onTimePercent}%</span> вчасно)
                {sla.currentlyOverdue > 0 && (
                  <>
                    ; зараз протерміновано й не виконано <span className="font-semibold text-rose-700">{sla.currentlyOverdue}</span>
                  </>
                )}
                {sla.escalated > 0 && (
                  <>
                    , ескальовано керівнику <span className="font-semibold text-amber-700">{sla.escalated}</span>
                  </>
                )}
              </p>

              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">За об&rsquo;єктом</p>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-50">
                      {sla.byObject.map((o) => (
                        <tr key={o.objectId}>
                          <td className="py-1 text-slate-700">{o.objectName}</td>
                          <td className="w-14 py-1 text-right tabular-nums text-slate-500">{o.onTimePercent}%</td>
                          {o.currentlyOverdue > 0 && (
                            <td className="w-20 py-1 text-right text-rose-600">горить: {o.currentlyOverdue}</td>
                          )}
                        </tr>
                      ))}
                      {!sla.byObject.length && (
                        <tr>
                          <td className="py-1 text-slate-400">Немає даних.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">За відповідальним</p>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-50">
                      {sla.byRole.map((r) => (
                        <tr key={r.role}>
                          <td className="py-1 text-slate-700">{SLA_ROLE_LABELS[r.role] ?? r.role}</td>
                          <td className="w-14 py-1 text-right tabular-nums text-slate-500">{r.onTimePercent}%</td>
                          {r.currentlyOverdue > 0 && (
                            <td className="w-20 py-1 text-right text-rose-600">горить: {r.currentlyOverdue}</td>
                          )}
                        </tr>
                      ))}
                      {!sla.byRole.length && (
                        <tr>
                          <td className="py-1 text-slate-400">Немає даних.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Section>

        <Section
          title="Оцінювання по авторах"
          right={
            <select
              value={ratingMonths}
              onChange={(e) => setRatingMonths(Number(e.target.value))}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value={1}>1 місяць</option>
              <option value={3}>3 місяці</option>
              <option value={6}>6 місяців</option>
              <option value={12}>12 місяців</option>
            </select>
          }
        >
          {!ratingAuthors && <p className="px-4 py-6 text-sm text-slate-500">Завантаження…</p>}
          {ratingAuthors && (
            <div className="px-4 py-3 space-y-4">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">
                  Ставить лише негатив <span className="font-normal text-slate-400">(від 3 оцінок за період, 0% позитиву/номінацій)</span>
                </p>
                {!ratingAuthors.onlyNegative.length ? (
                  <p className="text-sm text-slate-400">Немає таких авторів.</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-50">
                      {ratingAuthors.onlyNegative.map((r) => (
                        <tr key={r.authorId}>
                          <td className="py-1 text-slate-700">{r.authorName}</td>
                          <td className="w-32 py-1 text-right tabular-nums text-rose-700">{r.totalEvents} негативних оцінок</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">
                  Не ставить нічого <span className="font-normal text-slate-400">(є підлеглі, 0 оцінок за період)</span>
                </p>
                {!ratingAuthors.noRatings.length ? (
                  <p className="text-sm text-slate-400">Немає таких керівників.</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-50">
                      {ratingAuthors.noRatings.map((m) => (
                        <tr key={m.employmentId}>
                          <td className="py-1 text-slate-700">{m.fullName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">
                  Ставить усім однаково <span className="font-normal text-slate-400">(від 3 оцінок, один привід ≥80%)</span>
                </p>
                {!ratingAuthors.sameEverything.length ? (
                  <p className="text-sm text-slate-400">Немає таких авторів.</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-50">
                      {ratingAuthors.sameEverything.map((r) => (
                        <tr key={r.authorId}>
                          <td className="py-1 text-slate-700">{r.authorName}</td>
                          <td className="py-1 text-slate-500">{ratingKeyLabel(r.dominantKey, ratingCategories)}</td>
                          <td className="w-32 py-1 text-right tabular-nums text-amber-700">
                            {r.dominantSharePercent}% з {r.totalEvents}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
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
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="px-3 py-1.5 text-left font-medium">Працівник</th>
                  <th className="px-2 py-1.5 text-left font-medium">Об&rsquo;єкт</th>
                  <th className="px-2 py-1.5 text-left font-medium">Компетенція</th>
                  <th className="px-2 py-1.5 text-right font-medium">Строк</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expiring.map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1">
                      <p className="text-slate-900">{row.fullName}</p>
                      <p className="text-slate-500">{row.positionTitle}</p>
                    </td>
                    <td className="px-2 py-1 text-slate-600">{row.objectName}</td>
                    <td className="px-2 py-1 text-slate-600">{row.competencyName}</td>
                    <td className="px-2 py-1 text-right">
                      <span
                        className={`rounded px-1.5 py-0.5 font-medium ${
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

        <Section
          title="Куратори"
          right={
            <select
              value={curatorMonths}
              onChange={(e) => setCuratorMonths(Number(e.target.value))}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value={1}>1 місяць</option>
              <option value={3}>3 місяці</option>
              <option value={6}>6 місяців</option>
              <option value={12}>12 місяців</option>
            </select>
          }
        >
          {!curators && <p className="px-4 py-6 text-sm text-slate-500">Завантаження…</p>}
          {curators && !curators.rows.length && <p className="px-4 py-6 text-sm text-slate-500">Кураторів у видимій області немає.</p>}
          {curators && !!curators.rows.length && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="px-3 py-1.5 text-left font-medium">Куратор</th>
                  <th className="px-2 py-1.5 text-left font-medium">Об&rsquo;єкт</th>
                  <th className="px-2 py-1.5 text-right font-medium">Навчає зараз</th>
                  <th className="px-2 py-1.5 text-right font-medium">Навчив за {curators.months} міс.</th>
                  <th className="px-2 py-1.5 text-center font-medium">Наставник</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {curators.rows.map((r) => (
                  <tr key={r.curatorEmploymentId}>
                    <td className="px-3 py-1 text-slate-900">{r.curatorName}</td>
                    <td className="px-2 py-1 text-slate-600">{r.objectName}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-700">{r.currentlyTraining}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-700">{r.graduatedInPeriod}</td>
                    <td className="px-2 py-1 text-center">{r.hasMentorBadge && <span title="Бейдж «Наставник»">🏅</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          title="Рейтинг і нагороди"
          right={
            <select
              value={ratingSummaryMonths}
              onChange={(e) => setRatingSummaryMonths(Number(e.target.value))}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value={1}>1 місяць</option>
              <option value={3}>3 місяці</option>
              <option value={6}>6 місяців</option>
              <option value={12}>12 місяців</option>
            </select>
          }
        >
          {!ratingSummary && <p className="px-4 py-6 text-sm text-slate-500">Завантаження…</p>}
          {ratingSummary && !ratingSummary.byObject.length && !ratingSummary.byCluster.length && (
            <p className="px-4 py-6 text-sm text-slate-500">За обраний період оцінок не було.</p>
          )}
          {ratingSummary && (!!ratingSummary.byObject.length || !!ratingSummary.byCluster.length) && (
            <div className="px-4 py-3 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">По кластерах</p>
                  <RatingSummaryTable rows={ratingSummary.byCluster} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">По об&rsquo;єктах</p>
                  <RatingSummaryTable rows={ratingSummary.byObject} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">Топ за балом</p>
                  <RatingSummaryPersonTable rows={ratingSummary.topPositive} positive />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">Найнижчий бал</p>
                  <RatingSummaryPersonTable rows={ratingSummary.topNegative} positive={false} />
                </div>
              </div>
            </div>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
