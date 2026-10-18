"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type OnShiftRow = { employmentId: number; fullName: string; positionTitle: string; since: string };
type TerminalState = { terminalName: string; storeName: string; operatorName: string; onShift: OnShiftRow[] };
type Lookup = {
  employmentId: number;
  fullName: string;
  positionTitle: string;
  action: "ARRIVAL" | "DEPARTURE";
  openShiftSince: string | null;
  shortShift: boolean;
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

/** crypto.randomUUID є лише в захищеному контексті (https/localhost) — у локальній мережі по http його нема. */
function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Термінал обліку робочого часу (2026-10-18). Сканер штрихкодів працює як
 * клавіатура: друкує код і Enter у поле, яке завжди в фокусі. Нічого не
 * записується без підтвердження касиром (фото + ПІБ) — захист від випадкового
 * подвійного сканування й від помилки "не той бейдж".
 */
export default function TerminalPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<TerminalState | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<(Lookup & { code: string; eventId: string }) | null>(null);
  const [confirmShort, setConfirmShort] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  const handleAuthError = useCallback(
    (status: number, body: { error?: string; code?: string }) => {
      if (status === 401) {
        router.push("/login?next=/terminal");
        return true;
      }
      if (body.code === "NO_TERMINAL" || body.code === "FORBIDDEN" || body.code === "NO_EMPLOYMENT") {
        setFatal(body.error ?? "Термінал недоступний");
        return true;
      }
      return false;
    },
    [router],
  );

  const loadState = useCallback(() => {
    fetch("/api/terminal/state")
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (!r.ok) {
          if (!handleAuthError(r.status, b)) setFatal(b.error ?? "Не вдалося завантажити термінал");
          return;
        }
        setState(b);
      })
      .catch(() => setFatal("Немає зв'язку з сервером"));
  }, [handleAuthError]);

  useEffect(loadState, [loadState]);

  // Поле сканера завжди в фокусі, поки не відкрито діалог підтвердження.
  useEffect(() => {
    if (!lookup && state) inputRef.current?.focus();
  }, [lookup, state, message]);

  const submitCode = () => {
    const value = code.trim();
    setCode("");
    if (!value || busy) return;
    setBusy(true);
    setMessage(null);
    setPhotoFailed(false);
    setConfirmShort(false);
    fetch("/api/terminal/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: value }) })
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (!r.ok) {
          if (!handleAuthError(r.status, b)) setMessage({ ok: false, text: b.error ?? "Код не розпізнано" });
          return;
        }
        // eventId створюється ОДИН раз на діалог: подвійний клік "Підтвердити" шле той самий id.
        setLookup({ ...b, code: value, eventId: newEventId() });
      })
      .catch(() => setMessage({ ok: false, text: "Немає зв'язку з сервером — спробуйте ще раз" }))
      .finally(() => setBusy(false));
  };

  const confirm = () => {
    if (!lookup || busy) return;
    setBusy(true);
    fetch("/api/terminal/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: lookup.code, clientEventId: lookup.eventId, expectedAction: lookup.action, confirmShort }),
    })
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (!r.ok) {
          if (b.code === "CONFIRM_SHORT") {
            setConfirmShort(true);
            return;
          }
          if (!handleAuthError(r.status, b)) {
            setMessage({ ok: false, text: b.error ?? "Не вдалося зареєструвати" });
            setLookup(null);
          }
          return;
        }
        const verb = b.action === "ARRIVAL" ? "прибуття" : "завершення зміни";
        setMessage({ ok: true, text: b.duplicate ? `${b.fullName}: уже зареєстровано щойно (повтор проігноровано)` : `${b.fullName}: ${verb} зареєстровано` });
        setState((s) => (s ? { ...s, onShift: b.onShift } : s));
        setLookup(null);
      })
      .catch(() => setMessage({ ok: false, text: "Немає зв'язку з сервером — запис не збережено, скануйте ще раз" }))
      .finally(() => setBusy(false));
  };

  const logout = () => {
    fetch("/api/auth/logout", { method: "POST" }).then(() => router.push("/login?next=/terminal"));
  };

  if (fatal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-md rounded-md border border-rose-200 bg-white p-6 text-center">
          <p className="text-lg font-semibold text-rose-700">Термінал недоступний</p>
          <p className="mt-2 text-sm text-slate-600">{fatal}</p>
          <p className="mt-3 text-xs text-slate-400">Зверніться до системного адміністратора, щоб зареєструвати цей комп&rsquo;ютер як термінал магазину.</p>
          <button onClick={logout} className="mt-4 rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Вийти
          </button>
        </div>
      </div>
    );
  }
  if (!state) return <div className="p-6 text-sm text-slate-500">Завантаження…</div>;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex items-center justify-between bg-slate-900 px-6 py-3 text-white">
        <div>
          <p className="text-lg font-semibold">{state.storeName}</p>
          <p className="text-xs text-slate-400">
            {state.terminalName} · працює: {state.operatorName}
          </p>
        </div>
        <button onClick={logout} className="rounded border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800">
          Вийти
        </button>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="rounded-md border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-500">Піднесіть бейдж до сканера</p>
          <input
            ref={inputRef}
            value={code}
            disabled={!!lookup}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCode()}
            onBlur={() => !lookup && setTimeout(() => inputRef.current?.focus(), 50)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Код працівника"
            className="mt-3 w-full max-w-xs rounded border border-slate-300 px-3 py-2 text-center font-mono text-lg tracking-widest disabled:bg-slate-100"
          />
          <p className="mt-2 text-xs text-slate-400">Сканер не працює? Введіть код з бейджа вручну й натисніть Enter.</p>
          {message && (
            <p className={`mt-4 rounded px-3 py-2 text-sm font-medium ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
              {message.ok ? "✓ " : ""}
              {message.text}
            </p>
          )}
        </div>

        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">
            Зараз на зміні <span className="font-normal text-slate-400">({state.onShift.length})</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {state.onShift.map((p) => (
              <li key={p.employmentId} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  {p.fullName} <span className="text-xs text-slate-400">· {p.positionTitle}</span>
                </span>
                <span className="tabular-nums text-slate-500">з {time(p.since)}</span>
              </li>
            ))}
            {!state.onShift.length && <li className="px-4 py-6 text-center text-sm text-slate-400">Поки нікого.</li>}
          </ul>
        </div>
      </main>

      {lookup && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-md bg-white p-6 text-center">
            {photoFailed ? (
              <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full bg-slate-200 text-5xl font-semibold text-slate-500">
                {lookup.fullName
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")}
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/terminal/photo/${lookup.employmentId}`}
                alt=""
                onError={() => setPhotoFailed(true)}
                className="mx-auto h-40 w-40 rounded-full object-cover"
              />
            )}
            <p className="mt-4 text-xl font-semibold">{lookup.fullName}</p>
            <p className="text-sm text-slate-500">{lookup.positionTitle}</p>
            {photoFailed && <p className="mt-1 text-xs text-amber-700">Фото в системі немає — звіряйте за ПІБ.</p>}

            <p className={`mt-4 text-lg font-semibold ${lookup.action === "ARRIVAL" ? "text-emerald-700" : "text-indigo-700"}`}>
              {lookup.action === "ARRIVAL" ? "Зареєструвати ПРИБУТТЯ?" : "Зареєструвати ЗАВЕРШЕННЯ зміни?"}
            </p>
            {lookup.openShiftSince && <p className="text-sm text-slate-500">Зміну розпочато о {time(lookup.openShiftSince)}</p>}

            {confirmShort && (
              <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Зміна триває менше 30 хвилин. Точно завершити? Натисніть «Так, завершити».
              </p>
            )}

            <div className="mt-5 flex justify-center gap-3">
              <button
                disabled={busy}
                onClick={() => {
                  setLookup(null);
                  setConfirmShort(false);
                }}
                className="rounded border border-slate-300 px-5 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Скасувати
              </button>
              <button
                disabled={busy}
                onClick={confirm}
                className="rounded bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {confirmShort ? "Так, завершити" : "Так"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
