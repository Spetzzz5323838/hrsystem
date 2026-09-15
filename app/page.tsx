"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, AlertTriangle } from "lucide-react";
import AppShell from "./components/AppShell";

type MyTask = {
  taskId: number;
  employmentId: number;
  title: string;
  fullName: string;
  positionTitle: string;
  objectName: string;
  dueAt: string | null;
  overdue: boolean;
  tab: "process" | "transfer" | "termination";
};

type ExpiringCompetency = {
  personId: number;
  fullName: string;
  competencyName: string;
  validUntil: string;
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Avatar({ name }: { name: string }) {
  const parts = name.split(" ");
  const ini = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-white">
      {ini}
    </span>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);
  const [expiring, setExpiring] = useState<ExpiringCompetency[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => {
        if (r.status === 401) {
          router.push("/login");
          return null;
        }
        return r.json();
      })
      .then((me) => {
        if (!me) return;
        // Лінійний персонал (тільки SELF-скоуп) веде у власний кабінет,
        // не в адміністративний дашборд — той самий принцип, що й у /login.
        const isLineStaff = me.grants.every((g: { scope: string }) => g.scope === "SELF");
        if (isLineStaff) {
          router.push("/me");
          return;
        }
        return fetch("/api/me/tasks")
          .then((r2) => r2.json())
          .then((data) => {
            setMyTasks(data.myTasks);
            setExpiring(data.expiringCompetencies);
          });
      })
      .catch(() => setError("Не вдалося завантажити задачі"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Завантаження…</div>;
  if (error) return <div className="flex min-h-screen items-center justify-center text-sm text-rose-700">{error}</div>;

  return (
    <AppShell active="/">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Мої задачі</h2>

        {myTasks.length === 0 && expiring.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <p className="text-sm text-slate-600">Відкритих задач немає.</p>
          </div>
        )}

        {myTasks.length > 0 && (
          <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
            {myTasks.map((t) => (
              <button
                key={t.taskId}
                onClick={() => router.push(`/employees/${t.employmentId}?tab=${t.tab}`)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-slate-50"
              >
                <span className={`h-8 w-1 rounded ${t.overdue ? "bg-rose-500" : "bg-amber-500"}`} />
                <Avatar name={t.fullName} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{t.title}</p>
                  <p className="text-xs text-slate-500">
                    {t.fullName} · {t.positionTitle} · {t.objectName}
                    {t.dueAt && <span className={t.overdue ? "text-rose-600" : ""}> · до {fmt(t.dueAt)}</span>}
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
            ))}
          </div>
        )}

        {expiring.length > 0 && (
          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
              Компетенції, у яких спливає строк <span className="font-normal text-slate-500">— найближчі 2 місяці</span>
            </div>
            <div className="divide-y divide-slate-100">
              {expiring.map((x, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-2.5 text-left">
                  <AlertTriangle size={15} className="text-amber-500" />
                  <span className="flex-1 text-sm text-slate-800">{x.competencyName}</span>
                  <span className="text-sm text-slate-500">{x.fullName}</span>
                  <span className="tabular-nums text-sm text-amber-700">до {fmt(x.validUntil)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
