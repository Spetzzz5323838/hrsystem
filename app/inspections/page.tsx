"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type OpenRow = { id: number; storeName: string; kind: "DAILY" | "WEEKLY"; status: string; plannedFor: string; postponedCount: number; canStart: boolean; conductedBy: string | null };
type ViolationRow = { id: number; resultId: number; inspectionId: number; hasPhoto: boolean; storeName: string; where: string; text: string; comment: string; status: "OPEN" | "IN_PROGRESS" | "RESOLVED"; createdAt: string; takenBy: string | null };
type DoneRow = { id: number; storeName: string; kind: "DAILY" | "WEEKLY"; completedAt: string; conductedBy: string | null; green: number; yellow: number; red: number };

const fmt = (iso: string) => new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const kindLabel = (k: "DAILY" | "WEEKLY") => (k === "DAILY" ? "Щоденний обхід" : "Щотижневий обхід");

/** Список обходів для адміністратора. Окремий мобільний макет без бічної панелі: обходи проводять з телефону. */
export default function InspectionsPage() {
  const router = useRouter();
  const [open, setOpen] = useState<OpenRow[] | null>(null);
  const [done, setDone] = useState<DoneRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<ViolationRow[]>([]);
  const [resolvedViolations, setResolvedViolations] = useState<ViolationRow[]>([]);
  const [justCreated, setJustCreated] = useState<number | null>(null);

  const loadViolations = () => {
    fetch("/api/violations")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!b) return;
        setViolations(b.active);
        setResolvedViolations(b.resolved);
      })
      .catch(() => undefined);
  };
  const act = (id: number, action: "take" | "resolve") => {
    fetch(`/api/violations/${id}/${action}`, { method: "POST" })
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => (r.ok ? loadViolations() : setError(b.error ?? "Не вдалося виконати")))
      .catch(() => setError("Немає зв’язку з сервером"));
  };

  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("violations"));
    if (Number.isInteger(n) && n > 0) setJustCreated(n);
    loadViolations();
    fetch("/api/inspections")
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (r.status === 401) {
          router.push("/login?next=/inspections");
          return;
        }
        if (!r.ok) throw new Error(b.error ?? "Не вдалося завантажити");
        setOpen(b.open);
        setDone(b.done);
      })
      .catch((e) => setError(e.message));
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
        <h1 className="text-base font-semibold">Обходи</h1>
        <Link href="/" className="text-sm text-slate-300 hover:text-white">
          До системи
        </Link>
      </header>
      <main className="mx-auto max-w-xl space-y-4 p-4">
        {error && <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {!open && !error && <p className="text-sm text-slate-500">Завантаження…</p>}

        {justCreated !== null && (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Обхід завершено. Створено порушень: {justCreated} — відповідальним надіслано повідомлення в Telegram.
          </p>
        )}

        {violations.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-rose-700">Порушення ({violations.length})</h2>
            {violations.map((v) => (
              <div key={v.id} className="rounded-md border border-rose-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    🔴 {v.storeName} · {v.where}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs ${v.status === "OPEN" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}`}>
                    {v.status === "OPEN" ? "відкрите" : "в роботі"}
                  </span>
                </div>
                <p className="mt-1">{v.text}</p>
                <p className="mt-0.5 text-slate-600">{v.comment}</p>
                {v.hasPhoto && (
                  <a href={`/api/inspections/${v.inspectionId}/results/${v.resultId}/photo`} target="_blank" className="mt-1 inline-block text-xs text-slate-500 underline">
                    фото
                  </a>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  {fmt(v.createdAt)}
                  {v.takenBy && ` · прийняв: ${v.takenBy}`}
                </p>
                <div className="mt-2 flex gap-2">
                  {v.status === "OPEN" && (
                    <button onClick={() => act(v.id, "take")} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                      Прийнято в роботу
                    </button>
                  )}
                  <button onClick={() => act(v.id, "resolve")} className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">
                    Усунуто
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {open && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Заплановані</h2>
            {open.map((o) => (
              <Link
                key={o.id}
                href={`/inspections/${o.id}`}
                className={`block rounded-md border bg-white p-4 ${o.canStart || o.status === "IN_PROGRESS" ? "border-slate-300" : "border-slate-200 opacity-70"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{o.storeName}</p>
                  {o.status === "IN_PROGRESS" ? (
                    <span className="rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-700">іде</span>
                  ) : o.canStart ? (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">можна починати</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">ще не час</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {kindLabel(o.kind)} · {fmt(o.plannedFor)}
                </p>
                {o.postponedCount > 0 && <p className="mt-0.5 text-xs text-amber-700">Перенесено разів: {o.postponedCount}</p>}
                {o.conductedBy && o.status === "IN_PROGRESS" && <p className="mt-0.5 text-xs text-slate-400">Проводить: {o.conductedBy}</p>}
              </Link>
            ))}
            {!open.length && <p className="rounded-md bg-white p-4 text-sm text-slate-500">Запланованих обходів немає. Розклад задає сисадмін, COO або директор кластера.</p>}
          </section>
        )}

        {resolvedViolations.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Нещодавно усунуті порушення</h2>
            {resolvedViolations.map((v) => (
              <div key={v.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-500">
                ✔ {v.storeName} · {v.where}: {v.text}
              </div>
            ))}
          </section>
        )}

        {done.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Нещодавно проведені</h2>
            {done.map((d) => (
              <div key={d.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{d.storeName}</span>
                  <span className="whitespace-nowrap text-xs">
                    🟢 {d.green} · 🟡 {d.yellow} · 🔴 {d.red}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {kindLabel(d.kind)} · {fmt(d.completedAt)} · {d.conductedBy ?? "—"}
                </p>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
