"use client";

import { useEffect, useState } from "react";

type Material = { id: number; title: string; type: string; durationMin: number | null; deliverable: boolean; status: "new" | "received" | "viewed" | "updated"; requestedAt: string | null; viewedAt: string | null };
type Competency = { competencyId: number; name: string; isRequired: boolean; state: "valid" | "missing" | "expired"; mandatory: boolean; materials: Material[]; viewedCount: number };
type Plan = { positionTitle: string; competencies: Competency[]; requiredTotal: number; requiredViewed: number };

const STATUS_LABEL: Record<Material["status"], { text: string; className: string }> = {
  new: { text: "не отримано", className: "text-slate-400" },
  received: { text: "отримано, не відмічено", className: "text-amber-700" },
  viewed: { text: "переглянуто", className: "text-emerald-700" },
  updated: { text: "оновлено, переглянути знову", className: "text-amber-700" },
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

/** Вкладка «Навчання» в картці: що працівник отримав і переглянув (для адміністратора й вище). */
export default function TrainingTab({ employmentId }: { employmentId: string | number }) {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/employees/${employmentId}/training`)
      .then((r) => (r.ok ? r.json() : { plan: null }))
      .then((b) => setPlan(b.plan))
      .catch(() => setPlan(null));
  }, [employmentId]);

  if (plan === undefined) return <p className="text-sm text-slate-500">Завантаження…</p>;
  if (!plan || !plan.competencies.length) return <p className="rounded-md border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">Для цієї посади навчальних матеріалів ще немає.</p>;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">Обов&rsquo;язкові матеріали: переглянуто {plan.requiredViewed} з {plan.requiredTotal}</p>
        <div className="mt-2 h-2 overflow-hidden rounded bg-slate-100">
          <div className="h-full bg-emerald-500" style={{ width: `${plan.requiredTotal ? (plan.requiredViewed / plan.requiredTotal) * 100 : 100}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">Працівник сам отримує матеріали в Telegram («Навчання») і відмічає, що переглянув. Це самозвіт: підтвердженням знань лишається атестація.</p>
      </div>

      {plan.competencies.map((c) => (
        <div key={c.competencyId} className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
            <p className="text-sm font-semibold text-slate-800">
              {c.name}
              <span className="ml-2 text-xs font-normal text-slate-500">
                {c.state === "valid" ? "складено" : c.mandatory ? "обов'язкова" : "рекомендована"}
              </span>
            </p>
            <span className="text-xs text-slate-500">
              {c.viewedCount} з {c.materials.length}
            </span>
          </div>
          <ul className="divide-y divide-slate-100">
            {c.materials.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="text-slate-800">
                  {m.title}
                  <span className="ml-2 text-xs text-slate-400">
                    {m.type === "PDF" ? "PDF" : m.type === "VIDEO" ? "відео" : "посилання"}
                    {m.durationMin ? `, ${m.durationMin} хв` : ""}
                    {!m.deliverable ? " · ще не додано" : ""}
                  </span>
                </span>
                <span className={`whitespace-nowrap text-xs ${STATUS_LABEL[m.status].className}`}>
                  {STATUS_LABEL[m.status].text}
                  {m.status === "viewed" && m.viewedAt ? ` · ${fmt(m.viewedAt)}` : ""}
                  {m.status === "received" && m.requestedAt ? ` · ${fmt(m.requestedAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
