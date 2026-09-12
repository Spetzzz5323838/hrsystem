"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronRight, Circle, Network } from "lucide-react";

type OrgNode = {
  id: number;
  type: "COMPANY" | "DIVISION" | "OBJECT" | "DEPARTMENT";
  name: string;
  code: string | null;
  path: string;
  parentId: number | null;
};

type RosterRow = {
  positionProfileId: number;
  title: string;
  planned: number;
  actual: number;
};

type Staffing = {
  node: { id: number; name: string; type: OrgNode["type"]; path: string; code: string | null };
  headFullName: string | null;
  totalStaff: number;
  frozenCount: number;
  roster: RosterRow[];
};

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
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

export default function StructurePage() {
  const [nodes, setNodes] = useState<OrgNode[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const [staffing, setStaffing] = useState<Staffing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<{ link: string; qrDataUrl: string } | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/org-tree")
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "Потрібно увійти в систему" : "Не вдалося завантажити дерево");
        return r.json();
      })
      .then((data: OrgNode[]) => {
        setNodes(data);
        setOpenIds(new Set(data.map((n) => n.id)));
        const root = data.find((n) => n.type === "COMPANY");
        setSelectedId(root ? root.id : (data[0]?.id ?? null));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedId == null) return;
    setStaffing(null);
    fetch(`/api/org-nodes/${selectedId}/staffing`)
      .then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити картку вузла");
        return r.json();
      })
      .then(setStaffing)
      .catch((e) => setError(e.message));

    setQr(null);
    setQrError(null);
    setCopied(false);
    fetch(`/api/org-nodes/${selectedId}/qr`)
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося згенерувати QR");
        setQr(body);
      })
      .catch((e) => setQrError(e.message));
  }, [selectedId]);

  const copyLink = () => {
    if (!qr) return;
    navigator.clipboard
      .writeText(qr.link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  const children = useMemo(() => {
    const map = new Map<number | null, OrgNode[]>();
    (nodes ?? []).forEach((n) => {
      const list = map.get(n.parentId) ?? [];
      list.push(n);
      map.set(n.parentId, list);
    });
    return map;
  }, [nodes]);

  const toggle = (id: number) =>
    setOpenIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderNode = (n: OrgNode, depth: number): React.ReactNode => {
    const kids = children.get(n.id) ?? [];
    const isOpen = openIds.has(n.id);
    return (
      <div key={n.id}>
        <div
          onClick={() => setSelectedId(n.id)}
          className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm ${
            selectedId === n.id ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-100"
          }`}
          style={{ paddingLeft: depth * 14 + 8 }}
        >
          {kids.length ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggle(n.id);
              }}
              className="shrink-0"
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {n.type === "OBJECT" ? (
            <Building2 size={13} className="shrink-0" />
          ) : n.type === "DEPARTMENT" ? (
            <Circle size={7} className="shrink-0" />
          ) : (
            <Network size={13} className="shrink-0" />
          )}
          <span className="truncate">{n.name}</span>
        </div>
        {isOpen && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  if (error) {
    return <div className="px-6 py-6 text-sm text-rose-700">{error}</div>;
  }

  if (!nodes) {
    return <div className="px-6 py-6 text-sm text-slate-500">Завантаження…</div>;
  }

  const root = nodes.find((n) => n.parentId === null);

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-6">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Структура компанії</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="border border-slate-200 bg-white rounded-md p-2">{root && renderNode(root, 0)}</div>
          <div className="space-y-4 lg:col-span-2">
            {staffing && (
              <>
                <Section
                  title={staffing.node.name}
                  right={
                    <span className="text-xs text-slate-500">
                      {staffing.node.type} · шлях {staffing.node.path}
                    </span>
                  }
                >
                  <div className="grid grid-cols-3 gap-4 px-4 py-3 text-sm">
                    <div>
                      <p className="text-slate-500">Керівник</p>
                      <p className="text-slate-900">{staffing.headFullName || "не призначено"}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Працівників</p>
                      <p className="tabular-nums text-slate-900">{staffing.totalStaff}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Заморожено</p>
                      <p className="tabular-nums text-slate-900">{staffing.frozenCount}</p>
                    </div>
                  </div>
                </Section>
                <Section title="Штатний розпис">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Посада</th>
                        <th className="px-4 py-2 font-medium text-right">План</th>
                        <th className="px-4 py-2 font-medium text-right">Факт</th>
                        <th className="px-4 py-2 font-medium text-right">Стан</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {staffing.roster.map((r) => (
                        <tr key={r.positionProfileId}>
                          <td className="px-4 py-2 text-slate-800">{r.title}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-600">{r.planned}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-600">{r.actual}</td>
                          <td className="px-4 py-2 text-right text-xs">
                            {r.actual >= r.planned ? (
                              <span className="text-emerald-700">укомплектовано</span>
                            ) : (
                              <span className="text-amber-700">бракує {r.planned - r.actual}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!staffing.roster.length && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                            У цьому вузлі немає штатних одиниць.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </Section>
                <Section title="QR-код реєстрації">
                  {qrError && <p className="px-4 py-3 text-sm text-rose-700">{qrError}</p>}
                  {!qrError && !qr && <p className="px-4 py-3 text-sm text-slate-500">Завантаження…</p>}
                  {qr && (
                    <div className="flex flex-wrap items-center gap-4 px-4 py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qr.qrDataUrl} alt="QR-код реєстрації" width={140} height={140} className="rounded border border-slate-200" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm text-slate-600">
                          Новий працівник сканує цей код (або переходить за посиланням) і реєструється через Telegram-бот. Заявка
                          з&rsquo;явиться в розділі «Нові заявки» на сторінці «Працівники».
                        </p>
                        <div className="flex items-center gap-2">
                          <input readOnly value={qr.link} className="w-full max-w-md rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700" />
                          <button
                            onClick={copyLink}
                            className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {copied ? "Скопійовано" : "Копіювати"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
