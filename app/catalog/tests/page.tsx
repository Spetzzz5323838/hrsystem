"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../components/AppShell";

type OverviewRow = { competencyId: number; name: string; category: string | null; activeQuestions: number; testActive: boolean; positionsUsing: number };
type Question = { id: number; text: string; options: string[]; correctIndex: number; isActive: boolean; answered: boolean };
type Editor = {
  competency: { id: number; name: string };
  settings: { isActive: boolean; questionsPerAttempt: number | null; passPercent: number; excellentPercent: number; pauseMinutes: number; notifyAfterFails: number };
  questions: Question[];
};

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];

async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data: data as { error?: string; softDeleted?: boolean } };
}

/** Конструктор тестів компетенцій: питання з однією правильною відповіддю. Проходять працівники в Telegram. */
export default function TestsBuilderPage() {
  const [overview, setOverview] = useState<OverviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [search, setSearch] = useState("");

  // форма питання
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [qText, setQText] = useState("");
  const [qOptions, setQOptions] = useState<string[]>(["", ""]);
  const [qCorrect, setQCorrect] = useState(0);

  // налаштування
  const [passPercent, setPassPercent] = useState("80");
  const [excellentPercent, setExcellentPercent] = useState("90");
  const [perAttempt, setPerAttempt] = useState("");

  const loadOverview = useCallback(() => {
    fetch("/api/tests")
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (!r.ok) throw new Error(b.error ?? "Не вдалося завантажити");
        setOverview(b);
      })
      .catch((e) => setError(e.message));
  }, []);

  const loadEditor = useCallback((id: number) => {
    fetch(`/api/tests/${id}`)
      .then((r) => r.json())
      .then((b: Editor) => {
        setEditor(b);
        setPassPercent(String(b.settings.passPercent));
        setExcellentPercent(String(b.settings.excellentPercent));
        setPerAttempt(b.settings.questionsPerAttempt ? String(b.settings.questionsPerAttempt) : "");
      });
  }, []);

  useEffect(loadOverview, [loadOverview]);
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("competencyId"));
    if (Number.isInteger(id) && id > 0) setSelected(id);
  }, []);
  useEffect(() => {
    if (selected) {
      setFormOpen(false);
      setNotice(null);
      loadEditor(selected);
    }
  }, [selected, loadEditor]);

  const refresh = () => {
    if (selected) loadEditor(selected);
    loadOverview();
  };
  const report = (ok: boolean, text: string) => setNotice({ ok, text });

  const openNew = () => {
    setEditingId(null);
    setQText("");
    setQOptions(["", ""]);
    setQCorrect(0);
    setFormOpen(true);
    setNotice(null);
  };
  const openEdit = (q: Question) => {
    setEditingId(q.id);
    setQText(q.text);
    setQOptions(q.options);
    setQCorrect(q.correctIndex);
    setFormOpen(true);
    setNotice(null);
  };

  const saveQuestion = async () => {
    const body = { text: qText, options: qOptions, correctIndex: qCorrect };
    const { ok, data } = editingId ? await api(`/api/test-questions/${editingId}`, "PATCH", body) : await api(`/api/tests/${selected}/questions`, "POST", body);
    if (!ok) return report(false, data.error ?? "Не вдалося зберегти");
    setFormOpen(false);
    report(true, editingId ? "Питання збережено" : "Питання додано");
    refresh();
  };

  const saveSettings = async (patch: Record<string, unknown>, okText = "Налаштування збережено") => {
    const { ok, data } = await api(`/api/tests/${selected}`, "PUT", patch);
    if (!ok) return report(false, data.error ?? "Не вдалося зберегти");
    report(true, okText);
    refresh();
  };

  if (error) {
    return (
      <AppShell active="/catalog">
        <div className="text-sm text-rose-700">{error}</div>
      </AppShell>
    );
  }
  if (!overview) {
    return (
      <AppShell active="/catalog">
        <div className="text-sm text-slate-500">Завантаження…</div>
      </AppShell>
    );
  }

  const list = overview.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()));
  const activeCount = editor?.questions.filter((q) => q.isActive).length ?? 0;

  return (
    <AppShell active="/catalog">
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">Тести компетенцій</h2>
          <Link href="/catalog" className="text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900">
            ← До довідників
          </Link>
        </div>
        <p className="text-sm text-slate-500">
          Працівник проходить тест у Telegram: одне питання за раз, одна правильна відповідь. Від {passPercent}% тест зараховано (від {excellentPercent}% — 2 бали, інакше 1 бал), нижче —
          не зараховано. Правильні відповіді працівнику не показуються. Між спробами пауза 1 година; після 3 невдач поспіль адміністратор отримує сповіщення. Склав — компетенція записується
          автоматично, а пункт онбордингу «Тест …» закривається.
        </p>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук компетенції" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {list.map((c) => (
                <li key={c.competencyId}>
                  <button onClick={() => setSelected(c.competencyId)} className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${selected === c.competencyId ? "bg-slate-100" : ""}`}>
                    <span className="text-slate-800">{c.name}</span>
                    <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${c.activeQuestions > 0 && c.testActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {c.activeQuestions > 0 ? `${c.activeQuestions} пит.` : "немає"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 lg:col-span-2">
            {!editor && <p className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">Оберіть компетенцію зліва, щоб створити чи змінити її тест.</p>}

            {editor && (
              <>
                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{editor.competency.name}</h3>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={editor.settings.isActive} onChange={(e) => saveSettings({ isActive: e.target.checked }, e.target.checked ? "Тест увімкнено" : "Тест вимкнено")} />
                      тест увімкнено
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Активних питань: <b>{activeCount}</b>. {activeCount === 0 ? "Поки немає питань — працівники побачать «тест ще не підготовлено»." : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-3 text-xs text-slate-600">
                    <label>
                      Зараховано від, %
                      <input value={passPercent} onChange={(e) => setPassPercent(e.target.value)} className="mt-0.5 block w-20 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    </label>
                    <label>
                      Відмінно (2 бали) від, %
                      <input value={excellentPercent} onChange={(e) => setExcellentPercent(e.target.value)} className="mt-0.5 block w-20 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    </label>
                    <label>
                      Питань у спробі
                      <input value={perAttempt} onChange={(e) => setPerAttempt(e.target.value)} placeholder="усі" className="mt-0.5 block w-24 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    </label>
                    <button
                      onClick={() => saveSettings({ passPercent: Number(passPercent), excellentPercent: Number(excellentPercent), questionsPerAttempt: perAttempt.trim() ? Number(perAttempt) : null })}
                      className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                    >
                      Зберегти налаштування
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">«Питань у спробі»: якщо питань у пулі більше, кожному працівнику випадково підбирається вказана кількість (захист від списування). Порожньо — усі питання.</p>
                </div>

                {notice && <p className={`rounded px-3 py-2 text-sm ${notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{notice.text}</p>}

                {formOpen && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
                    <p className="text-sm font-medium text-amber-900">{editingId ? "Редагування питання" : "Нове питання"}</p>
                    <textarea value={qText} onChange={(e) => setQText(e.target.value)} rows={3} placeholder="Текст питання" className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm" />
                    <p className="mt-2 text-xs text-slate-600">Варіанти відповіді (від 2 до 6). Позначте кружечком правильну.</p>
                    <div className="mt-1 space-y-1.5">
                      {qOptions.map((o, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="radio" name="correct" checked={qCorrect === i} onChange={() => setQCorrect(i)} title="Правильна відповідь" />
                          <span className="w-4 text-xs text-slate-500">{LETTERS[i]}</span>
                          <input
                            value={o}
                            onChange={(e) => setQOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                            placeholder={`Варіант ${LETTERS[i]}`}
                            className="grow rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                          />
                          {qOptions.length > 2 && (
                            <button
                              onClick={() => {
                                setQOptions((prev) => prev.filter((_, j) => j !== i));
                                setQCorrect((c) => (c === i ? 0 : c > i ? c - 1 : c));
                              }}
                              className="text-xs text-rose-600"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {qOptions.length < 6 && (
                      <button onClick={() => setQOptions((prev) => [...prev, ""])} className="mt-2 text-xs text-slate-600 underline underline-offset-2">
                        + додати варіант
                      </button>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button onClick={saveQuestion} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                        Зберегти питання
                      </button>
                      <button onClick={() => setFormOpen(false)} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm">
                        Скасувати
                      </button>
                    </div>
                  </div>
                )}

                <div className="rounded-md border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
                    <p className="text-sm font-semibold text-slate-800">Питання ({editor.questions.length})</p>
                    <button onClick={openNew} className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50">
                      + Додати питання
                    </button>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {editor.questions.map((q, n) => (
                      <li key={q.id} className={`px-4 py-3 text-sm ${q.isActive ? "" : "bg-slate-50 text-slate-400"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium">
                            {n + 1}. {q.text}
                            {!q.isActive && <span className="ml-2 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-normal text-slate-500">вимкнено</span>}
                          </p>
                          <span className="flex shrink-0 gap-3 text-xs">
                            <button onClick={() => openEdit(q)} className="text-slate-600 hover:text-slate-900">
                              змінити
                            </button>
                            <button
                              onClick={async () => {
                                const { ok, data } = await api(`/api/test-questions/${q.id}`, "PATCH", { isActive: !q.isActive });
                                if (!ok) report(false, data.error ?? "Не вдалося");
                                refresh();
                              }}
                              className="text-slate-600 hover:text-slate-900"
                            >
                              {q.isActive ? "вимкнути" : "увімкнути"}
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm(q.answered ? "На це питання вже відповідали, тому його буде лише вимкнено (історія збережеться). Продовжити?" : "Видалити питання?")) return;
                                const { ok, data } = await api(`/api/test-questions/${q.id}`, "DELETE");
                                if (!ok) report(false, data.error ?? "Не вдалося");
                                else report(true, data.softDeleted ? "Питання вимкнено (на нього вже відповідали)" : "Питання видалено");
                                refresh();
                              }}
                              className="text-rose-600 hover:text-rose-800"
                            >
                              видалити
                            </button>
                          </span>
                        </div>
                        <ul className="mt-1 space-y-0.5 text-xs">
                          {q.options.map((o, i) => (
                            <li key={i} className={i === q.correctIndex ? "font-medium text-emerald-700" : "text-slate-600"}>
                              {LETTERS[i]}) {o} {i === q.correctIndex && "✔"}
                            </li>
                          ))}
                        </ul>
                        {q.answered && q.isActive && <p className="mt-1 text-xs text-slate-400">На це питання вже відповідали: при зміні тексту чи відповідей створюється нова версія питання.</p>}
                      </li>
                    ))}
                    {!editor.questions.length && <li className="px-4 py-6 text-center text-sm text-slate-500">Питань ще немає. Натисніть «Додати питання».</li>}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
