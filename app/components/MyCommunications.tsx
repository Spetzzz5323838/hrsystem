"use client";

import { useEffect, useState } from "react";

type AnnouncementRow = { id: number; title: string; body: string; objectName: string; createdAt: string };

/** Оголошення, що стосуються сесійної людини (правки 2026-09-25) — той самий /api/me/announcements для / і /me. */
export function MyAnnouncements() {
  const [items, setItems] = useState<AnnouncementRow[] | null>(null);

  useEffect(() => {
    fetch("/api/me/announcements")
      .then((r) => (r.ok ? r.json() : []))
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  if (!items || !items.length) return null;

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Оголошення</div>
      <div className="divide-y divide-slate-100">
        {items.map((a) => (
          <div key={a.id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{a.title}</p>
              <span className="text-xs text-slate-400">
                {a.objectName} · {new Date(a.createdAt).toLocaleDateString("uk-UA")}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

type PollOptionRow = { id: number; text: string; voteCount: number | null };
type PollRow = {
  id: number;
  question: string;
  isAnonymous: boolean;
  objectName: string;
  closesAt: string | null;
  hasVoted: boolean;
  myOptionId: number | null;
  totalVotes: number | null;
  options: PollOptionRow[];
};

/** Відкриті опитування зі своєю панеллю голосування (правки 2026-09-25) — той самий castVote, що й у боті. */
export function MyPolls() {
  const [polls, setPolls] = useState<PollRow[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/me/polls")
      .then((r) => (r.ok ? r.json() : []))
      .then(setPolls)
      .catch(() => setPolls([]));
  };

  useEffect(() => {
    load();
  }, []);

  const vote = (pollId: number, optionId: number) => {
    setBusyId(pollId);
    setError(null);
    fetch(`/api/me/polls/${pollId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) throw new Error(b.error ?? "Не вдалося проголосувати");
        load();
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusyId(null));
  };

  if (!polls || !polls.length) return null;

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Опитування</div>
      {error && <p className="px-4 pt-2 text-sm text-rose-700">{error}</p>}
      <div className="divide-y divide-slate-100">
        {polls.map((p) => (
          <div key={p.id} className="px-4 py-3">
            <p className="text-sm font-medium text-slate-900">
              {p.question} {p.isAnonymous && <span className="ml-1 text-xs text-slate-400">(анонімне)</span>}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">{p.objectName}</p>
            <div className="mt-2 space-y-1.5">
              {p.options.map((o) => {
                const isMine = p.myOptionId === o.id;
                if (p.hasVoted) {
                  const pct = p.totalVotes ? Math.round(((o.voteCount ?? 0) / p.totalVotes) * 100) : 0;
                  return (
                    <div key={o.id} className="text-sm">
                      <div className={`flex justify-between ${isMine ? "font-medium text-slate-900" : "text-slate-600"}`}>
                        <span>
                          {o.text} {isMine && "✓"}
                        </span>
                        <span className="tabular-nums text-slate-500">
                          {o.voteCount} ({pct}%)
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded bg-slate-100">
                        <div className={`h-1.5 rounded ${isMine ? "bg-slate-800" : "bg-slate-400"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                }
                return (
                  <button
                    key={o.id}
                    disabled={busyId === p.id}
                    onClick={() => vote(p.id, o.id)}
                    className="block w-full rounded border border-slate-300 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {o.text}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
