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

type ReminderRow = {
  id: number;
  employmentId: number;
  fullName: string;
  positionTitle: string;
  objectName: string;
  text: string;
  dueAt: string | null;
  isDone: boolean;
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

type GroupMode = "none" | "employee" | "due";

const DUE_BUCKET_ORDER = ["Протерміновано", "До 3 днів", "До тижня", "Пізніше", "Без терміну"];

function dueBucket(t: MyTask): string {
  if (t.overdue) return "Протерміновано";
  if (!t.dueAt) return "Без терміну";
  const days = (new Date(t.dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (days <= 3) return "До 3 днів";
  if (days <= 7) return "До тижня";
  return "Пізніше";
}

function groupTasks(tasks: MyTask[], mode: GroupMode): [string, MyTask[]][] {
  if (mode === "none") return [["", tasks]];
  const by = mode === "employee" ? (t: MyTask) => t.fullName : dueBucket;
  const groups = new Map<string, MyTask[]>();
  for (const t of tasks) {
    const key = by(t);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const keys = mode === "due" ? DUE_BUCKET_ORDER.filter((k) => groups.has(k)) : [...groups.keys()].sort((a, b) => a.localeCompare(b, "uk"));
  return keys.map((k) => [k, groups.get(k)!]);
}

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);
  const [expiring, setExpiring] = useState<ExpiringCompetency[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [reminderFilterDone, setReminderFilterDone] = useState(false);
  const [reminderFilterQuery, setReminderFilterQuery] = useState("");
  const [reminderBusyId, setReminderBusyId] = useState<number | null>(null);

  const loadReminders = (done: boolean) => {
    fetch(`/api/reminders?done=${done}`)
      .then((r) => r.json())
      .then((data) => setReminders(data))
      .catch(() => {});
  };

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
        loadReminders(false);
        return fetch("/api/me/tasks")
          .then((r2) => r2.json())
          .then((data) => {
            setMyTasks(data.myTasks);
            setExpiring(data.expiringCompetencies);
          });
      })
      .catch(() => setError("Не вдалося завантажити задачі"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!loading) loadReminders(reminderFilterDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminderFilterDone]);

  const toggleReminder = (id: number, isDone: boolean) => {
    setReminderBusyId(id);
    fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDone }),
    })
      .then(() => loadReminders(reminderFilterDone))
      .finally(() => setReminderBusyId(null));
  };

  const visibleReminders = reminders.filter((r) => r.fullName.toLowerCase().includes(reminderFilterQuery.trim().toLowerCase()));

  if (loading) {
    return (
      <AppShell active="/">
        <div className="text-sm text-slate-500">Завантаження…</div>
      </AppShell>
    );
  }
  if (error) {
    return (
      <AppShell active="/">
        <div className="text-sm text-rose-700">{error}</div>
      </AppShell>
    );
  }

  return (
    <AppShell active="/">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">Мої задачі</h2>
          {myTasks.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Групувати:
              <select
                value={groupMode}
                onChange={(e) => setGroupMode(e.target.value as GroupMode)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              >
                <option value="none">Не групувати</option>
                <option value="employee">За працівником</option>
                <option value="due">За терміном</option>
              </select>
            </label>
          )}
        </div>

        {myTasks.length === 0 && expiring.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <p className="text-sm text-slate-600">Відкритих задач немає.</p>
          </div>
        )}

        {myTasks.length > 0 &&
          groupTasks(myTasks, groupMode).map(([group, tasks]) => (
            <div key={group || "flat"} className="rounded-md border border-slate-200 bg-white">
              {group && (
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-500">
                  {group} <span className="font-normal">({tasks.length})</span>
                </div>
              )}
              <div className="divide-y divide-slate-100">
                {tasks.map((t) => (
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
            </div>
          ))}

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

        <div className="rounded-md border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
            <span className="text-sm font-medium text-slate-700">Мої нагадування</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={reminderFilterQuery}
                onChange={(e) => setReminderFilterQuery(e.target.value)}
                placeholder="Пошук за працівником…"
                className="rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={reminderFilterDone} onChange={(e) => setReminderFilterDone(e.target.checked)} />
                показати виконані
              </label>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {visibleReminders.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={r.isDone}
                  disabled={reminderBusyId === r.id}
                  onChange={(e) => toggleReminder(r.id, e.target.checked)}
                  className="h-4 w-4"
                />
                <button
                  onClick={() => router.push(`/employees/${r.employmentId}?tab=reminders`)}
                  className={`min-w-0 flex-1 text-left text-sm hover:underline ${r.isDone ? "text-slate-400 line-through" : "text-slate-800"}`}
                >
                  {r.text} <span className="text-slate-400">— {r.fullName}</span>
                </button>
                {r.dueAt && <span className="tabular-nums text-xs text-slate-500">до {fmt(r.dueAt)}</span>}
              </div>
            ))}
            {!visibleReminders.length && <p className="px-4 py-6 text-center text-sm text-slate-500">Нагадувань немає.</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
