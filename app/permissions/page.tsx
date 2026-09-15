"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

type ProfilesData = { capabilities: string[]; profiles: { id: number; name: string; capabilities: string[] }[] };
type PositionProfile = { id: number; title: string; level: number };
type Assignment = { id: number; positionProfileId: number | null; role: string | null; accessProfileId: number; scope: string };
type AssignmentsData = { positionProfiles: PositionProfile[]; roles: string[]; profiles: { id: number; name: string }[]; assignments: Assignment[] };

type Person = { personId: number; fullName: string; positionTitle: string; objectName: string };
type SimResult = { fullName: string; scopePaths: string[]; grants: { capability: string; scope: string; scopePath: string | null }[] };

const CAPABILITY_LABELS: Record<string, string> = {
  VIEW_EMPLOYEE: "Перегляд картки працівника",
  EDIT_PROFILE: "Редагування профілю",
  ACTIVATE_EMPLOYEE: "Активація працівника",
  ASSIGN_CURATOR: "Призначення куратора",
  VIEW_DOCUMENTS: "Перегляд сканів документів",
  UPLOAD_DOCUMENTS: "Завантаження документів",
  SET_1C_PASSWORD: "Видача пароля 1С",
  CLOSE_INTERNSHIP: "Закриття стажування",
  RUN_ATTESTATION: "Приймання атестації",
  RATE_POSITIVE_NEGATIVE: "Оцінка позитив/негатив",
  ISSUE_REPRIMAND_AWARD: "Догана / нагорода",
  ASSIGN_EQUIPMENT: "Закріплення обладнання",
  CLEAR_EQUIPMENT: "Квитування обладнання",
  INIT_TERMINATION: "Ініціація звільнення",
  APPROVE_TERMINATION: "Погодження звільнення",
  CLOSE_TERMINATION: "Закриття звільнення",
  PRINT_CLEARANCE: "Друк листа узгодження",
  MANAGE_MATERIALS: "Керування довідниками навчання",
  MANAGE_TEMPLATES: "Керування шаблонами процесів",
  MANAGE_ORG_STRUCTURE: "Керування оргструктурою",
  VIEW_ANALYTICS: "Перегляд аналітики",
  VIEW_AUDIT_LOG: "Перегляд аудит-логу",
  MANAGE_REMINDERS: "Керування нагадуваннями",
  FREEZE: "Заморозка працівника",
  INIT_TRANSFER: "Ініціація переведення",
  APPROVE_TRANSFER: "Погодження переведення",
  MANAGE_PERMISSIONS: "Керування правами доступу",
};

const SCOPE_LABELS: Record<string, string> = {
  SELF: "Тільки себе",
  SUBORDINATES: "Підлеглі",
  OWN_DEPARTMENT: "Свій відділ",
  OWN_OBJECT: "Свій об'єкт",
  OWN_SUBTREE: "Своє піддерево",
  COMPANY: "Уся компанія",
};

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Працівник",
  CURATOR: "Куратор",
  STORE_ADMIN: "Адміністратор магазину",
  ONEC_ADMIN: "Оператор 1С",
  ACCOUNTANT: "Бухгалтер",
  AUDITOR: "Ревізор",
  COO: "Керівництво (COO)",
  SYSADMIN: "Системний адміністратор",
};

const SCOPE_OPTIONS = ["SELF", "SUBORDINATES", "OWN_DEPARTMENT", "OWN_OBJECT", "OWN_SUBTREE", "COMPANY"];

function ProfilesSection({ data, reload }: { data: ProfilesData; reload: () => void }) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggle = (profileId: number, capability: string, enabled: boolean) => {
    fetch(`/api/access-profiles/${profileId}/capabilities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capability, enabled }),
    })
      .then((r) => (r.ok ? reload() : r.json().then((b) => Promise.reject(new Error(b.error)))))
      .catch((e) => setError(e.message));
  };

  const rename = (profileId: number, name: string) => {
    if (!name.trim()) return;
    fetch(`/api/access-profiles/${profileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        reload();
      })
      .catch((e) => setError(e.message));
  };

  const remove = (profileId: number) => {
    fetch(`/api/access-profiles/${profileId}`, { method: "DELETE" })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        reload();
      })
      .catch((e) => setError(e.message));
  };

  const create = () => {
    if (!newName.trim()) return;
    fetch("/api/access-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        setNewName("");
        reload();
      })
      .catch((e) => setError(e.message));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Назва нового профілю"
          className="w-64 rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button onClick={create} className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
          + Профіль
        </button>
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[240px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium text-slate-600">
                Можливість
              </th>
              {data.profiles.map((p) => (
                <th key={p.id} className="min-w-[170px] border-b border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium text-slate-600">
                  <div className="flex items-center gap-1">
                    <input
                      key={`${p.id}-${p.name}`}
                      defaultValue={p.name}
                      onBlur={(e) => e.target.value !== p.name && rename(p.id, e.target.value)}
                      className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 font-medium text-slate-700 hover:border-slate-300 focus:border-slate-400 focus:outline-none"
                    />
                    <button onClick={() => remove(p.id)} title="Видалити профіль" className="shrink-0 text-slate-400 hover:text-rose-600">
                      <X size={13} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.capabilities.map((cap) => (
              <tr key={cap}>
                <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-1.5 text-slate-800">{CAPABILITY_LABELS[cap] ?? cap}</td>
                {data.profiles.map((p) => (
                  <td key={p.id} className="px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={p.capabilities.includes(cap)}
                      onChange={(e) => toggle(p.id, cap, e.target.checked)}
                      className="h-4 w-4"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssignmentsSection({ data, reload }: { data: AssignmentsData; reload: () => void }) {
  const [tab, setTab] = useState<"profiles" | "roles">("profiles");
  const [error, setError] = useState<string | null>(null);
  const [pendingProfileId, setPendingProfileId] = useState<Record<string, number | "">>({});
  const [pendingScope, setPendingScope] = useState<Record<string, string>>({});

  const profileName = (id: number) => data.profiles.find((p) => p.id === id)?.name ?? `#${id}`;

  const rows: { key: string; label: string; target: { positionProfileId?: number; role?: string } }[] =
    tab === "profiles"
      ? data.positionProfiles.map((p) => ({ key: `p${p.id}`, label: p.title, target: { positionProfileId: p.id } }))
      : data.roles.map((r) => ({ key: `r${r}`, label: ROLE_LABELS[r] ?? r, target: { role: r } }));

  const assignmentsFor = (row: (typeof rows)[number]) =>
    data.assignments.filter((a) => (row.target.positionProfileId != null ? a.positionProfileId === row.target.positionProfileId : a.role === row.target.role));

  const addAssignment = (row: (typeof rows)[number]) => {
    const accessProfileId = pendingProfileId[row.key];
    const scope = pendingScope[row.key];
    if (!accessProfileId || !scope) return;

    fetch("/api/access-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...row.target, accessProfileId, scope }),
    })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error);
        setPendingProfileId((s) => ({ ...s, [row.key]: "" }));
        setPendingScope((s) => ({ ...s, [row.key]: "" }));
        reload();
      })
      .catch((e) => setError(e.message));
  };

  const removeAssignment = (id: number) => {
    fetch(`/api/access-assignments/${id}`, { method: "DELETE" })
      .then((r) => r.json())
      .then(() => reload())
      .catch(() => setError("Не вдалося зняти призначення"));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-slate-200">
        {(["profiles", "roles"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm ${tab === t ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t === "profiles" ? "Профілі посад" : "Функціональні ролі"}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-700">{error}</p>}

      <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
        {rows.map((row) => {
          const rowAssignments = assignmentsFor(row);
          return (
            <div key={row.key} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="w-56 shrink-0 text-sm font-medium text-slate-800">{row.label}</span>
              <div className="flex flex-1 flex-wrap items-center gap-1.5">
                {rowAssignments.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                    {profileName(a.accessProfileId)} · {SCOPE_LABELS[a.scope] ?? a.scope}
                    <button onClick={() => removeAssignment(a.id)} className="text-slate-400 hover:text-rose-600">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <select
                  value={pendingProfileId[row.key] ?? ""}
                  onChange={(e) => setPendingProfileId((s) => ({ ...s, [row.key]: e.target.value ? Number(e.target.value) : "" }))}
                  className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                >
                  <option value="">профіль…</option>
                  {data.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={pendingScope[row.key] ?? ""}
                  onChange={(e) => setPendingScope((s) => ({ ...s, [row.key]: e.target.value }))}
                  className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                >
                  <option value="">область…</option>
                  {SCOPE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {SCOPE_LABELS[s]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => addAssignment(row)}
                  disabled={!pendingProfileId[row.key] || !pendingScope[row.key]}
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
                >
                  Додати
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PermissionsPage() {
  const [profilesData, setProfilesData] = useState<ProfilesData | null>(null);
  const [assignmentsData, setAssignmentsData] = useState<AssignmentsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [simPersonId, setSimPersonId] = useState<number | "">("");
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  const loadProfiles = () =>
    fetch("/api/access-profiles")
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося завантажити профілі");
        setProfilesData(body);
      })
      .catch((e) => setError(e.message));

  const loadAssignments = () =>
    fetch("/api/access-assignments")
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося завантажити призначення");
        setAssignmentsData(body);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadProfiles();
    loadAssignments();
    fetch("/api/permission-grants/people")
      .then((r) => (r.ok ? r.json() : []))
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);

  const runSimulation = () => {
    if (!simPersonId) return;
    setSimError(null);
    setSimResult(null);
    fetch(`/api/permission-grants/simulate?personId=${simPersonId}`)
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося симулювати");
        setSimResult(body);
      })
      .catch((e) => setSimError(e.message));
  };

  if (error && !profilesData) return <div className="px-6 py-6 text-sm text-rose-700">{error}</div>;
  if (!profilesData || !assignmentsData) return <div className="px-6 py-6 text-sm text-slate-500">Завантаження…</div>;

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-6">
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-slate-900">Права доступу</h2>
        {error && <p className="text-sm text-rose-700">{error}</p>}

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">Профілі доступу — що можна</h3>
          <p className="text-xs text-slate-500">Пойменований набір можливостей, без області дії.</p>
          <ProfilesSection data={profilesData} reload={loadProfiles} />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">Призначення — кому і де</h3>
          <p className="text-xs text-slate-500">Який профіль дано посаді чи ролі, і в межах якої області дії.</p>
          <AssignmentsSection data={assignmentsData} reload={loadAssignments} />
        </div>

        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-800">Симуляція</h3>
            <p className="text-xs text-slate-500">Оберіть працівника — побачите точно те, що бачить і може він, без перелогування під ним.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <select value={simPersonId} onChange={(e) => setSimPersonId(e.target.value ? Number(e.target.value) : "")} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">Оберіть працівника…</option>
              {people.map((p) => (
                <option key={p.personId} value={p.personId}>
                  {p.fullName} — {p.positionTitle}
                </option>
              ))}
            </select>
            <button onClick={runSimulation} disabled={!simPersonId} className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
              Симулювати
            </button>
          </div>

          {simError && <p className="px-4 pb-3 text-sm text-rose-700">{simError}</p>}

          {simResult && (
            <div className="border-t border-slate-100 px-4 py-3">
              <p className="mb-2 text-sm text-slate-700">
                <span className="font-medium">{simResult.fullName}</span> бачить і може в межах:{" "}
                <span className="text-slate-500">{simResult.scopePaths.join(", ") || "нічого (без області)"}</span>
              </p>
              {simResult.grants.length === 0 ? (
                <p className="text-sm text-slate-500">Жодної можливості не надано.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <tr>
                      <th className="py-1.5 font-medium">Можливість</th>
                      <th className="py-1.5 font-medium">Область</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {simResult.grants.map((g, i) => (
                      <tr key={i}>
                        <td className="py-1.5 text-slate-800">{CAPABILITY_LABELS[g.capability] ?? g.capability}</td>
                        <td className="py-1.5 text-slate-600">
                          {SCOPE_LABELS[g.scope] ?? g.scope}
                          {g.scopePath && <span className="text-slate-400"> · {g.scopePath}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
