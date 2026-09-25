"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MyAnnouncements, MyPolls } from "../components/MyCommunications";

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

const COMPETENCY_STATE_LABELS: Record<string, { label: string; cls: string }> = {
  valid: { label: "Чинна", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  expired: { label: "Прострочена", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  missing: { label: "Не пройдена", cls: "bg-slate-100 text-slate-600 border-slate-300" },
};

const MATERIAL_TYPE_LABELS: Record<string, string> = { PDF: "PDF", VIDEO: "Відео", LINK: "Посилання" };

const PROCESS_TYPE_LABELS: Record<string, string> = {
  ONBOARDING: "Онбординг",
  TRANSFER: "Переведення",
  OFFBOARDING: "Звільнення",
  EXTRA_TRAINING: "Додаткове навчання",
};

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Працівник",
  CURATOR: "Куратор",
  STORE_ADMIN: "Адміністратор",
  ONEC_ADMIN: "Оператор 1С",
  ACCOUNTANT: "Бухгалтер",
  AUDITOR: "Ревізор",
  COO: "Керівництво",
  SYSADMIN: "Системний адміністратор",
};

function roleLabel(role: string | null): string {
  if (!role) return "Система";
  return ROLE_LABELS[role] ?? role;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 bg-white rounded-md">
      <div className="border-b border-slate-200 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

type Profile = {
  employmentId: number;
  fullName: string;
  phone: string;
  positionTitle: string;
  objectName: string;
  status: string;
  hiredAt: string | null;
  curatorName: string | null;
};

type DeltaRow = { competencyId: number; name: string; state: "valid" | "expired" | "missing"; validUntil: string | null };
type MaterialRow = { id: number; title: string; type: string; url: string | null; hasFile: boolean; durationMin: number | null };

type TaskRow = {
  taskId: number;
  order: number;
  title: string;
  responsibleRole: string | null;
  isBlocking: boolean;
  status: string;
  blocked: boolean;
  overdue: boolean;
  assigneeName: string | null;
  dueAt: string | null;
  completedAt: string | null;
};

type ChecklistData = {
  instance: { id: number; type: string; state: string; startedAt: string; finishedAt: string | null } | null;
  tasks?: TaskRow[];
};

export default function MePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [delta, setDelta] = useState<DeltaRow[] | null>(null);
  const [materials, setMaterials] = useState<MaterialRow[] | null>(null);
  const [checklist, setChecklist] = useState<ChecklistData | null>(null);

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => {
        if (r.status === 401) {
          router.push("/login");
          return null;
        }
        if (!r.ok) throw new Error("Не вдалося завантажити профіль");
        return r.json();
      })
      .then((body) => {
        if (body) setProfile(body);
      })
      .catch((e) => setProfileError(e.message));

    fetch("/api/me/training")
      .then((r) => (r.ok ? r.json() : { delta: [], materials: [] }))
      .then((body) => {
        setDelta(body.delta);
        setMaterials(body.materials);
      })
      .catch(() => {
        setDelta([]);
        setMaterials([]);
      });

    fetch("/api/me/checklist")
      .then((r) => (r.ok ? r.json() : { instance: null }))
      .then(setChecklist)
      .catch(() => setChecklist({ instance: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    fetch("/api/auth/logout", { method: "POST" }).then(() => router.push("/login"));
  };

  if (profileError) {
    return <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-rose-700">{profileError}</div>;
  }

  if (!profile) {
    return <div className="mx-auto max-w-2xl px-4 py-10 text-center text-sm text-slate-500">Завантаження…</div>;
  }

  const statusMeta = STATUS_LABELS[profile.status] ?? { label: profile.status, cls: "bg-slate-100 text-slate-700 border-slate-300" };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{profile.fullName}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {profile.positionTitle} · {profile.objectName}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${statusMeta.cls}`}>{statusMeta.label}</span>
            {profile.curatorName && <span className="text-xs text-slate-500">Куратор: {profile.curatorName}</span>}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {profile.phone} · прийнятий {fmtDate(profile.hiredAt)}
          </p>
        </div>
        <button onClick={logout} className="shrink-0 rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          Вийти
        </button>
      </div>

      <MyAnnouncements />
      <MyPolls />

      {checklist?.instance && (
        <Section title={`${PROCESS_TYPE_LABELS[checklist.instance.type] ?? checklist.instance.type} — прогрес`}>
          <ol className="divide-y divide-slate-100">
            {(checklist.tasks ?? []).map((t) => {
              const done = t.status === "DONE";
              return (
                <li key={t.taskId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className={done ? "text-slate-500 line-through" : "text-slate-900"}>{t.title}</span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 border border-slate-200">
                      {roleLabel(t.responsibleRole)}
                    </span>
                    {t.overdue && <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700 border border-rose-200">протерміновано</span>}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {done ? `Виконано ${fmtDateTime(t.completedAt)}` : t.blocked ? "Очікує попередній крок" : t.dueAt ? `До ${fmtDateTime(t.dueAt)}` : "—"}
                  </span>
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      <Section title="Навчальний профіль">
        {!delta ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">Завантаження…</div>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {delta.map((d) => {
                const meta = COMPETENCY_STATE_LABELS[d.state];
                return (
                  <tr key={d.competencyId}>
                    <td className="px-4 py-2.5 text-slate-800">{d.name}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-400">{d.validUntil ? `до ${fmtDate(d.validUntil)}` : ""}</td>
                  </tr>
                );
              })}
              {!delta.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500">Для вашої посади компетенції ще не налаштовані.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Матеріали">
        {!materials ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">Завантаження…</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {materials.map((m) => {
              // Завантажений файл важливіший за url — див. app/catalog/page.tsx.
              const href = m.hasFile ? `/api/materials/${m.id}/file` : m.url;
              return (
                <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-slate-800 underline underline-offset-2 hover:text-slate-900">
                      {m.title}
                    </a>
                  ) : (
                    <span className="text-slate-800">{m.title}</span>
                  )}
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    {MATERIAL_TYPE_LABELS[m.type] ?? m.type}
                    {m.durationMin ? ` · ${m.durationMin} хв` : ""}
                  </span>
                </li>
              );
            })}
            {!materials.length && <li className="px-4 py-8 text-center text-sm text-slate-500">Матеріалів ще немає.</li>}
          </ul>
        )}
      </Section>
    </div>
  );
}
