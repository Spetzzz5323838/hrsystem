"use client";

import { useEffect, useState } from "react";

type Attempt = { id: number; competencyName: string; finishedAt: string; correct: number; total: number; percent: number; score: number; passed: boolean };

/** Вкладка «Тести»: журнал спроб працівника (результат, відсоток, бал). Правильні відповіді не зберігаємо для показу. */
export default function TestsTab({ employmentId }: { employmentId: string | number }) {
  const [attempts, setAttempts] = useState<Attempt[] | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/employees/${employmentId}/tests`)
      .then((r) => (r.ok ? r.json() : { attempts: null }))
      .then((b) => setAttempts(b.attempts))
      .catch(() => setAttempts(null));
  }, [employmentId]);

  if (attempts === undefined) return <p className="text-sm text-slate-500">Завантаження…</p>;
  if (attempts === null) return <p className="rounded-md border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">Немає доступу.</p>;
  if (!attempts.length) return <p className="rounded-md border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">Працівник ще не проходив тестів.</p>;

  const failedInRow = (() => {
    const byCompetency = new Map<string, number>();
    const done = new Set<string>();
    for (const a of attempts) {
      if (done.has(a.competencyName)) continue;
      if (a.passed) done.add(a.competencyName);
      else byCompetency.set(a.competencyName, (byCompetency.get(a.competencyName) ?? 0) + 1);
    }
    return [...byCompetency.entries()].filter(([, n]) => n >= 3);
  })();

  return (
    <div className="space-y-3">
      {failedInRow.length > 0 && (
        <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Невдалі спроби поспіль: {failedInRow.map(([name, n]) => `«${name}» — ${n}`).join("; ")}. Варто поговорити з працівником.
        </p>
      )}
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Коли</th>
              <th className="px-3 py-2 font-medium">Тест</th>
              <th className="px-3 py-2 text-right font-medium">Правильно</th>
              <th className="px-3 py-2 text-right font-medium">Бал</th>
              <th className="px-3 py-2 font-medium">Результат</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {attempts.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{new Date(a.finishedAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="px-3 py-2 text-slate-800">{a.competencyName}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                  {a.correct} з {a.total} ({a.percent}%)
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{a.score}</td>
                <td className="px-3 py-2">{a.passed ? <span className="text-emerald-700">зараховано</span> : <span className="text-rose-700">не зараховано</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
