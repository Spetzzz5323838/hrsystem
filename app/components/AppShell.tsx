"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListChecks, Users, BookOpen, Network, ShieldCheck, CalendarDays, BarChart3, Megaphone, ScanBarcode, Clock } from "lucide-react";

const NAV = [
  { href: "/", label: "Мої задачі", icon: ListChecks },
  { href: "/employees", label: "Працівники", icon: Users },
  { href: "/vacations", label: "Відпустки", icon: CalendarDays },
  { href: "/communications", label: "Комунікації", icon: Megaphone, cap: "MANAGE_ANNOUNCEMENTS" },
  { href: "/terminal", label: "Термінал", icon: ScanBarcode, cap: "OPERATE_TERMINAL" },
  { href: "/terminals", label: "Термінали", icon: ScanBarcode, cap: "MANAGE_TERMINALS" },
  { href: "/timesheet", label: "Табель", icon: Clock, cap: "VIEW_TIMESHEET" },
  { href: "/structure", label: "Структура", icon: Network },
  { href: "/catalog", label: "Довідники", icon: BookOpen },
  { href: "/analytics", label: "Аналітика", icon: BarChart3, cap: "VIEW_ANALYTICS" },
  { href: "/permissions", label: "Права доступу", icon: ShieldCheck, cap: "MANAGE_PERMISSIONS" },
] as const;

/**
 * Спільна оболонка (бічна панель + шапка) — за візуальним рішенням
 * прототипу (hr-prototype-v3.jsx, компонент App: aside+nav+header).
 * Підключена до всіх сторінок з NAV (і картки працівника) — кожна сторінка
 * монтує власний екземпляр (а не спільний layout), тож loading/error-стани
 * теж мають обгортати свій контент у <AppShell>, інакше панель на мить
 * (чи назавжди, при 403) зникає.
 */
export default function AppShell({ active, children }: { active: string; children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<{ fullName: string; phone: string; positions?: string[] } | null>(null);
  const [caps, setCaps] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setMe(data);
        setCaps(new Set((data?.grants ?? []).map((g: { capability: string }) => g.capability)));
      })
      .catch(() => setMe(null));
  }, []);

  const visibleNav = NAV.filter((n) => !("cap" in n) || caps.has(n.cap));

  const logout = () => {
    fetch("/api/auth/logout", { method: "POST" }).then(() => {
      router.push("/login");
      router.refresh();
    });
  };

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="flex w-56 shrink-0 flex-col bg-slate-900">
        <div className="border-b border-slate-800 px-4 py-4">
          <p className="text-sm font-semibold text-white">Персонал</p>
          <p className="mt-0.5 text-xs text-slate-400">Прийом · навчання · рух · звільнення</p>
        </div>
        <nav className="flex-1 py-2">
          {visibleNav.map((n) => {
            const Icon = n.icon;
            const isActive = active === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex w-full items-center gap-2.5 border-l-2 px-4 py-2.5 text-sm ${
                  isActive
                    ? "border-amber-500 bg-slate-800 text-white"
                    : "border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <Icon size={16} /> {n.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <span className="text-sm text-slate-500">{me ? `${me.fullName} · ${me.positions?.length ? me.positions.join(", ") + " · " : ""}${me.phone}` : ""}</span>
          <button onClick={logout} className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50">
            Вийти
          </button>
        </header>
        <main className="flex-1 overflow-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
