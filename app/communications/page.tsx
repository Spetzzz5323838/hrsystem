"use client";

import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";

type OrgNode = { id: number; type: string; name: string; code: string | null; path: string; parentId: number | null };
type AnnouncementRow = { id: number; title: string; body: string; objectName: string; authorName: string | null; createdAt: string };
type PollOptionRow = { id: number; text: string; voteCount: number };
type PollRow = {
  id: number;
  question: string;
  isAnonymous: boolean;
  status: "OPEN" | "CLOSED";
  objectName: string;
  authorName: string | null;
  createdAt: string;
  closesAt: string | null;
  options: PollOptionRow[];
  totalVotes: number;
};

const NODE_TYPE_LABELS: Record<string, string> = { COMPANY: "Компанія", DIVISION: "Кластер/напрям", OBJECT: "Магазин/цех/склад", DEPARTMENT: "Відділ" };

function Section({ title, right, children }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 bg-white rounded-md">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function hasAccess(scopePath: string, targetPath: string): boolean {
  return targetPath === scopePath || targetPath.startsWith(`${scopePath}.`);
}

function NodePicker({ value, onChange, nodes }: { value: string; onChange: (v: string) => void; nodes: OrgNode[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
      <option value="">— оберіть —</option>
      {nodes.map((n) => (
        <option key={n.id} value={n.id}>
          {"—".repeat(n.path.split(".").length - 1)} {n.name} ({NODE_TYPE_LABELS[n.type] ?? n.type})
        </option>
      ))}
    </select>
  );
}

export default function CommunicationsPage() {
  const [tab, setTab] = useState<"announcements" | "polls">("announcements");
  const [nodes, setNodes] = useState<OrgNode[] | null>(null);
  const [scopePaths, setScopePaths] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ── Оголошення ──
  const [announcements, setAnnouncements] = useState<AnnouncementRow[] | null>(null);
  const [targetNodeId, setTargetNodeId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ recipientCount: number } | null>(null);

  const loadAnnouncements = () => {
    fetch("/api/announcements")
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Немає доступу до оголошень" : "Не вдалося завантажити");
        return r.json();
      })
      .then(setAnnouncements)
      .catch((e) => setError(e.message));
  };

  // ── Опитування ──
  const [polls, setPolls] = useState<PollRow[] | null>(null);
  const [pollNodeId, setPollNodeId] = useState("");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [closesAt, setClosesAt] = useState("");
  const [pollSubmitting, setPollSubmitting] = useState(false);
  const [pollSubmitError, setPollSubmitError] = useState<string | null>(null);
  const [pollLastResult, setPollLastResult] = useState<{ recipientCount: number } | null>(null);
  const [pollBusyId, setPollBusyId] = useState<number | null>(null);

  const loadPolls = () => {
    fetch("/api/polls")
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Немає доступу до опитувань" : "Не вдалося завантажити");
        return r.json();
      })
      .then(setPolls)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    fetch("/api/org-tree")
      .then((r) => (r.ok ? r.json() : []))
      .then(setNodes)
      .catch(() => setNodes([]));

    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        const paths = (me?.grants ?? [])
          .filter((g: { capability: string; scopePath: string | null }) => g.capability === "MANAGE_ANNOUNCEMENTS" && g.scopePath)
          .map((g: { scopePath: string }) => g.scopePath);
        setScopePaths(paths);
      })
      .catch(() => {});

    loadAnnouncements();
    loadPolls();
  }, []);

  const selectableNodes = (nodes ?? [])
    .filter((n) => scopePaths.some((sp) => hasAccess(sp, n.path)))
    .sort((a, b) => a.path.localeCompare(b.path));

  const submitAnnouncement = () => {
    if (!targetNodeId || !title.trim() || !body.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    setLastResult(null);
    fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgNodeId: Number(targetNodeId), title: title.trim(), body: body.trim() }),
    })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error ?? "Не вдалося надіслати оголошення");
        setTitle("");
        setBody("");
        setLastResult({ recipientCount: b.recipientCount });
        loadAnnouncements();
      })
      .catch((e) => setSubmitError(e.message))
      .finally(() => setSubmitting(false));
  };

  const submitPoll = () => {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!pollNodeId || !question.trim() || cleanOptions.length < 2) return;
    setPollSubmitting(true);
    setPollSubmitError(null);
    setPollLastResult(null);
    fetch("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgNodeId: Number(pollNodeId),
        question: question.trim(),
        options: cleanOptions,
        isAnonymous,
        closesAt: closesAt || null,
      }),
    })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error ?? "Не вдалося створити опитування");
        setQuestion("");
        setOptions(["", ""]);
        setIsAnonymous(false);
        setClosesAt("");
        setPollLastResult({ recipientCount: b.recipientCount });
        loadPolls();
      })
      .catch((e) => setPollSubmitError(e.message))
      .finally(() => setPollSubmitting(false));
  };

  const closePollRow = (id: number) => {
    setPollBusyId(id);
    fetch(`/api/polls/${id}`, { method: "PATCH" })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error ?? "Не вдалося закрити");
        loadPolls();
      })
      .catch((e) => setError(e.message))
      .finally(() => setPollBusyId(null));
  };

  if (error) {
    return (
      <AppShell active="/communications">
        <div className="text-sm text-rose-700">{error}</div>
      </AppShell>
    );
  }

  if (!nodes || !announcements || !polls) {
    return (
      <AppShell active="/communications">
        <div className="text-sm text-slate-500">Завантаження…</div>
      </AppShell>
    );
  }

  return (
    <AppShell active="/communications">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Комунікації</h2>

        <div className="flex gap-1 border-b border-slate-200">
          {(
            [
              ["announcements", "Оголошення"],
              ["polls", "Опитування"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                tab === k ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "announcements" && (
          <>
            <Section title="Нове оголошення">
              <div className="space-y-3 px-4 py-3">
                <label className="block">
                  <span className="text-sm text-slate-700">Кому (вузол дерева й усе, що нижче)</span>
                  <NodePicker value={targetNodeId} onChange={setTargetNodeId} nodes={selectableNodes} />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700">Заголовок</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700">Текст</span>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                {submitError && <p className="text-sm text-rose-700">{submitError}</p>}
                {lastResult && <p className="text-sm text-emerald-700">Надіслано. Отримувачів: {lastResult.recipientCount}.</p>}
                <button
                  disabled={submitting || !targetNodeId || !title.trim() || !body.trim()}
                  onClick={submitAnnouncement}
                  className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Надіслати
                </button>
              </div>
            </Section>

            <Section title="Надіслані оголошення">
              <div className="divide-y divide-slate-100">
                {announcements.map((a) => (
                  <div key={a.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{a.title}</p>
                      <span className="text-xs text-slate-400">
                        {a.objectName} · {new Date(a.createdAt).toLocaleDateString("uk-UA")}
                        {a.authorName && ` · ${a.authorName}`}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
                  </div>
                ))}
                {!announcements.length && <p className="px-4 py-8 text-center text-sm text-slate-500">Оголошень ще не було.</p>}
              </div>
            </Section>
          </>
        )}

        {tab === "polls" && (
          <>
            <Section title="Нове опитування">
              <div className="space-y-3 px-4 py-3">
                <label className="block">
                  <span className="text-sm text-slate-700">Кому (вузол дерева й усе, що нижче)</span>
                  <NodePicker value={pollNodeId} onChange={setPollNodeId} nodes={selectableNodes} />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700">Питання</span>
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <div className="space-y-1.5">
                  <span className="text-sm text-slate-700">Варіанти відповіді</span>
                  {options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={o}
                        onChange={(e) => setOptions((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                        placeholder={`Варіант ${i + 1}`}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      {options.length > 2 && (
                        <button
                          onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                          className="shrink-0 text-xs text-rose-600 hover:text-rose-800"
                        >
                          прибрати
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setOptions((prev) => [...prev, ""])} className="text-xs text-slate-600 hover:text-slate-900">
                    + додати варіант
                  </button>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} className="h-4 w-4" />
                  Анонімне опитування (у результатах — лише підсумкові цифри)
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700">Дедлайн (необов&rsquo;язково)</span>
                  <input
                    type="datetime-local"
                    value={closesAt}
                    onChange={(e) => setClosesAt(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                {pollSubmitError && <p className="text-sm text-rose-700">{pollSubmitError}</p>}
                {pollLastResult && <p className="text-sm text-emerald-700">Надіслано. Отримувачів: {pollLastResult.recipientCount}.</p>}
                <button
                  disabled={pollSubmitting || !pollNodeId || !question.trim() || options.map((o) => o.trim()).filter(Boolean).length < 2}
                  onClick={submitPoll}
                  className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Запустити опитування
                </button>
              </div>
            </Section>

            <Section title="Опитування">
              <div className="divide-y divide-slate-100">
                {polls.map((p) => (
                  <div key={p.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">
                        {p.question} {p.isAnonymous && <span className="ml-1 text-xs text-slate-400">(анонімне)</span>}
                      </p>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded border px-2 py-0.5 text-xs ${
                            p.status === "OPEN" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 bg-slate-50 text-slate-600"
                          }`}
                        >
                          {p.status === "OPEN" ? "відкрите" : "закрите"}
                        </span>
                        {p.status === "OPEN" && (
                          <button
                            disabled={pollBusyId === p.id}
                            onClick={() => closePollRow(p.id)}
                            className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Закрити
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {p.objectName} · {new Date(p.createdAt).toLocaleDateString("uk-UA")}
                      {p.authorName && ` · ${p.authorName}`} · голосів: {p.totalVotes}
                    </p>
                    <div className="mt-2 space-y-1">
                      {p.options.map((o) => {
                        const pct = p.totalVotes ? Math.round((o.voteCount / p.totalVotes) * 100) : 0;
                        return (
                          <div key={o.id} className="text-sm">
                            <div className="flex justify-between text-slate-700">
                              <span>{o.text}</span>
                              <span className="tabular-nums text-slate-500">
                                {o.voteCount} ({pct}%)
                              </span>
                            </div>
                            <div className="mt-0.5 h-1.5 rounded bg-slate-100">
                              <div className="h-1.5 rounded bg-slate-700" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {!polls.length && <p className="px-4 py-8 text-center text-sm text-slate-500">Опитувань ще не було.</p>}
              </div>
            </Section>
          </>
        )}
      </div>
    </AppShell>
  );
}
