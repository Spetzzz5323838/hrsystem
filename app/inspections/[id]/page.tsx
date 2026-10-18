"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Rating = "GREEN" | "YELLOW" | "RED";
type Checkpoint = {
  key: string;
  itemId: number;
  text: string;
  section: string;
  areaId: number | null;
  employmentId: number | null;
  result: { id: number; rating: Rating; comment: string | null; hasPhoto: boolean } | null;
};
type Data = { id: number; storeName: string; kind: "DAILY" | "WEEKLY"; status: string; plannedFor: string; checkpoints: Checkpoint[]; notes: string[] };
type Draft = { rating: Rating; comment: string; file: File | null; busy: boolean; error: string | null };

const EMOJI: Record<Rating, string> = { GREEN: "🟢", YELLOW: "🟡", RED: "🔴" };
const BG: Record<Rating, string> = { GREEN: "bg-emerald-50 border-emerald-300", YELLOW: "bg-amber-50 border-amber-300", RED: "bg-rose-50 border-rose-300" };

/** Стискає фото з телефону до ~1600 px, щоб не вантажити мобільною мережею мегабайти. Якщо не вдалося — шле як є. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Екран обходу: великі кнопки 🟢🟡🔴, мобільний макет без бічної панелі. */
export default function InspectionRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/inspections/${id}`)
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (r.status === 401) {
          router.push(`/login?next=/inspections/${id}`);
          return;
        }
        if (!r.ok) throw new Error(b.error ?? "Не вдалося завантажити");
        setData(b);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [id, router]);
  useEffect(load, [load]);

  const sections = useMemo(() => {
    const map = new Map<string, Checkpoint[]>();
    for (const c of data?.checkpoints ?? []) map.set(c.section, [...(map.get(c.section) ?? []), c]);
    return [...map.entries()];
  }, [data]);

  const total = data?.checkpoints.length ?? 0;
  const rated = data?.checkpoints.filter((c) => c.result).length ?? 0;

  const setDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((prev) => {
      const base: Draft = prev[key] ?? { rating: "RED", comment: "", file: null, busy: false, error: null };
      return { ...prev, [key]: { ...base, ...patch } };
    });

  const save = async (c: Checkpoint, rating: Rating, comment: string, file: File | null) => {
    setDraft(c.key, { busy: true, error: null });
    const r = await fetch(`/api/inspections/${id}/result`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: c.itemId, areaId: c.areaId, employmentId: c.employmentId, rating, comment }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) {
      setDraft(c.key, { busy: false, error: b.error ?? "Не вдалося зберегти" });
      return;
    }
    if (file && rating !== "GREEN") {
      const form = new FormData();
      form.append("file", await shrink(file), "photo.jpg");
      const pr = await fetch(`/api/inspections/${id}/results/${b.resultId}/photo`, { method: "POST", body: form });
      if (!pr.ok) {
        const pb = await pr.json().catch(() => ({}));
        setDraft(c.key, { busy: false, error: `Оцінку збережено, але фото не завантажилось: ${pb.error ?? "помилка"}` });
        load();
        return;
      }
    }
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(c.key);
      return next;
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[c.key];
      return next;
    });
    load();
  };

  const start = async () => {
    setBusy(true);
    const r = await fetch(`/api/inspections/${id}/start`, { method: "POST" });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setError(b.error ?? "Не вдалося розпочати");
    else load();
  };

  const finish = async () => {
    setBusy(true);
    const r = await fetch(`/api/inspections/${id}/complete`, { method: "POST" });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setError(b.error ?? "Не вдалося завершити");
    else router.push(`/inspections?violations=${b.violations ?? 0}`);
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-28 text-slate-900">
      <header className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-center justify-between">
          <Link href="/inspections" className="text-sm text-slate-300 hover:text-white">
            ← Обходи
          </Link>
          {data && (
            <span className="text-xs text-slate-300">
              {rated}/{total}
            </span>
          )}
        </div>
        {data && (
          <>
            <p className="mt-1 font-semibold">{data.storeName}</p>
            <p className="text-xs text-slate-400">{data.kind === "DAILY" ? "Щоденний обхід" : "Щотижневий обхід"}</p>
            {total > 0 && (
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-700">
                <div className="h-full bg-emerald-400" style={{ width: `${(rated / total) * 100}%` }} />
              </div>
            )}
          </>
        )}
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
        {error && <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {!data && !error && <p className="text-sm text-slate-500">Завантаження…</p>}

        {data?.status === "PLANNED" && (
          <div className="rounded-md bg-white p-4 text-center">
            <p className="text-sm text-slate-600">Під час обходу система зафіксує чинну версію регламенту.</p>
            <button disabled={busy} onClick={start} className="mt-3 w-full rounded-md bg-slate-900 py-3 text-base font-semibold text-white disabled:opacity-50">
              Розпочати обхід
            </button>
          </div>
        )}
        {data?.status === "COMPLETED" && <p className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">Цей обхід уже завершено.</p>}

        {data?.status === "IN_PROGRESS" &&
          sections.map(([section, cps]) => (
            <section key={section} className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">{section}</h2>
              {cps.map((c) => {
                const draft = drafts[c.key];
                const showButtons = !c.result || editing.has(c.key);
                const needsDetails = draft && draft.rating !== "GREEN" && showButtons;
                return (
                  <div key={c.key} className={`rounded-md border p-3 ${c.result && !showButtons ? BG[c.result.rating] : "border-slate-200 bg-white"}`}>
                    <p className="text-sm">{c.text}</p>

                    {c.result && !showButtons && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-lg">{EMOJI[c.result.rating]}</span>
                          <button
                            onClick={() => {
                              setEditing((prev) => new Set(prev).add(c.key));
                              setDraft(c.key, { rating: c.result!.rating, comment: c.result!.comment ?? "" });
                            }}
                            className="text-xs text-slate-500 underline"
                          >
                            змінити
                          </button>
                        </div>
                        {c.result.comment && <p className="text-sm text-slate-700">{c.result.comment}</p>}
                        {c.result.hasPhoto && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/inspections/${id}/results/${c.result.id}/photo`} alt="Фото до оцінки" className="max-h-40 rounded" />
                        )}
                      </div>
                    )}

                    {showButtons && (
                      <div className="mt-2">
                        <div className="grid grid-cols-3 gap-2">
                          {(["GREEN", "YELLOW", "RED"] as Rating[]).map((r) => (
                            <button
                              key={r}
                              disabled={draft?.busy}
                              onClick={() => {
                                if (r === "GREEN") save(c, r, "", null);
                                else setDraft(c.key, { rating: r });
                              }}
                              className={`rounded-md border py-3 text-2xl disabled:opacity-50 ${draft?.rating === r && r !== "GREEN" ? BG[r] : "border-slate-300 bg-white"}`}
                              aria-label={r}
                            >
                              {EMOJI[r]}
                            </button>
                          ))}
                        </div>

                        {needsDetails && (
                          <div className="mt-3 space-y-2">
                            <textarea
                              value={draft.comment}
                              onChange={(e) => setDraft(c.key, { comment: e.target.value })}
                              rows={3}
                              placeholder={draft.rating === "RED" ? "Що не так? (обов’язково)" : "Коментар (необов’язково)"}
                              className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                            />
                            <label className="block text-sm text-slate-600">
                              Фото (за потреби)
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => setDraft(c.key, { file: e.target.files?.[0] ?? null })}
                                className="mt-1 block w-full text-sm"
                              />
                            </label>
                            <button
                              disabled={draft.busy || (draft.rating === "RED" && draft.comment.trim().length < 3)}
                              onClick={() => save(c, draft.rating, draft.comment, draft.file)}
                              className="w-full rounded-md bg-slate-900 py-3 text-base font-semibold text-white disabled:opacity-50"
                            >
                              {draft.busy ? "Зберігаю…" : "Зберегти"}
                            </button>
                          </div>
                        )}
                        {draft?.error && <p className="mt-2 text-sm text-rose-700">{draft.error}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}

        {data?.status === "IN_PROGRESS" && data.notes.length > 0 && (
          <ul className="space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        {data?.status === "IN_PROGRESS" && !total && <p className="rounded-md bg-white p-4 text-sm text-slate-500">У цьому обході немає вимог для оцінки.</p>}
      </main>

      {data?.status === "IN_PROGRESS" && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-3">
          <div className="mx-auto max-w-xl">
            <button disabled={busy || rated < total} onClick={finish} className="w-full rounded-md bg-emerald-600 py-3 text-base font-semibold text-white disabled:bg-slate-300">
              {rated < total ? `Лишилось оцінити: ${total - rated}` : "Завершити обхід"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
