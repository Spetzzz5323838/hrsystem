"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося увійти");
        return fetch("/api/me")
          .then((r) => (r.ok ? r.json() : null))
          .then((me) => {
            // Лінійний персонал (level 10/15 у seed) отримує лише SELF-скоуп
            // VIEW_EMPLOYEE — жодного гранту з ширшою областю. Такий акаунт
            // веде у власний кабінет, а не в адміністративний список.
            const isLineStaff = !me || me.grants.every((g: { scope: string }) => g.scope === "SELF");
            router.push(isLineStaff ? "/me" : "/employees");
            router.refresh();
          });
      })
      .catch((e) => setError(e.message))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Вхід у систему</h1>

        <div className="space-y-1">
          <label className="block text-sm text-slate-600" htmlFor="phone">
            Номер телефону
          </label>
          <input
            id="phone"
            type="tel"
            required
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+380..."
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-800 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm text-slate-600" htmlFor="password">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-800 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-rose-700">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Входимо…" : "Увійти"}
        </button>
      </form>
    </div>
  );
}
