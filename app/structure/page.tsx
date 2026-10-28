"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronRight, Circle, Network } from "lucide-react";
import AppShell from "../components/AppShell";

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

type StaffingNode = {
  id: number;
  name: string;
  type: OrgNode["type"];
  path: string;
  code: string | null;
  parentId: number | null;
  address: string | null;
  sortOrder: number;
  isActive: boolean;
};

type Staffing = {
  node: StaffingNode;
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

const NODE_TYPE_LABELS: Record<OrgNode["type"], string> = {
  COMPANY: "Компанія",
  DIVISION: "Напрям / кластер",
  OBJECT: "Об'єкт",
  DEPARTMENT: "Відділ",
};

/** Які типи можуть бути батьком для кожного рівня (дзеркало правил на сервері, lib/orgstructure.ts). */
const ALLOWED_PARENTS: Record<string, OrgNode["type"][]> = {
  DIVISION: ["COMPANY", "DIVISION"],
  OBJECT: ["COMPANY", "DIVISION"],
  DEPARTMENT: ["DIVISION", "OBJECT", "DEPARTMENT"],
};

const LEVEL_CARDS: { type: "DIVISION" | "OBJECT" | "DEPARTMENT"; title: string; text: string; where: string }[] = [
  {
    type: "DIVISION",
    title: "Кластер / напрям",
    text: "Група магазинів чи підрозділів під одним керівником. Приклади: «Кластер 1», «Виробництво», «Адміністрація».",
    where: "Створюється в компанії або всередині іншого напряму.",
  },
  {
    type: "OBJECT",
    title: "Об'єкт",
    text: "Окреме місце роботи: магазин, пекарський цех або склад. Саме на об'єкт прив'язуються працівники, термінали, обходи.",
    where: "Створюється всередині кластера / напряму.",
  },
  {
    type: "DEPARTMENT",
    title: "Відділ",
    text: "Підрозділ усередині об'єкта чи напряму. Приклади: «Бухгалтерія», «Гастроном», «Каси».",
    where: "Створюється всередині об'єкта або напряму.",
  },
];

/** Модальне вікно "Створити вузол": спершу вибір рівня (картки з поясненням), потім — де його створити. */
function CreateNodeModal({
  nodes,
  defaultParentId,
  onClose,
  onCreated,
}: {
  nodes: OrgNode[];
  defaultParentId: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<"DIVISION" | "OBJECT" | "DEPARTMENT">("OBJECT");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [parentId, setParentId] = useState(defaultParentId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parentOptions = nodes.filter((n) => ALLOWED_PARENTS[type].includes(n.type));
  // Якщо поточний батько не підходить обраному рівню — беремо перший підходящий.
  const effectiveParentId = parentOptions.some((n) => n.id === parentId) ? parentId : (parentOptions[0]?.id ?? parentId);
  const parent = nodes.find((n) => n.id === effectiveParentId);
  const card = LEVEL_CARDS.find((c) => c.type === type)!;

  const submit = () => {
    if (!name.trim()) {
      setError("Вкажіть назву");
      return;
    }
    setBusy(true);
    setError(null);
    fetch("/api/org-nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name, code: code || null, parentId: effectiveParentId }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося створити вузол");
        onCreated();
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-lg space-y-4 rounded-md border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">Створити елемент структури</h3>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-600">1. Що створюємо?</p>
          <div className="grid gap-2">
            {LEVEL_CARDS.map((c) => (
              <button
                key={c.type}
                type="button"
                onClick={() => setType(c.type)}
                className={`rounded-md border px-3 py-2 text-left ${type === c.type ? "border-slate-800 bg-slate-50 ring-1 ring-slate-800" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <span className="text-sm font-semibold text-slate-900">{c.title}</span>
                <span className="mt-0.5 block text-xs text-slate-600">{c.text}</span>
                <span className="mt-0.5 block text-xs text-slate-400">{c.where}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600">2. Де створити (усередині чого)</label>
          <select value={effectiveParentId} onChange={(e) => setParentId(Number(e.target.value))} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
            {parentOptions.map((n) => (
              <option key={n.id} value={n.id}>
                {"— ".repeat(n.path.split(".").length - 1)}
                {n.name} ({NODE_TYPE_LABELS[n.type]})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600">3. Назва</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-slate-600">Код (необов&rsquo;язково)</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>

        <p className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Буде створено: <b>{card.title}</b> «{name.trim() || "…"}» усередині «{parent?.name ?? "—"}».
        </p>

        {error && <p className="text-sm text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Скасувати
          </button>
          <button
            disabled={busy}
            onClick={submit}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Створити
          </button>
        </div>
      </div>
    </div>
  );
}

/** Модальне вікно "Створити об'єкт за шаблоном" — клонує відділи й штатний розпис. */
function TemplateModal({
  objectNodes,
  parentNodes,
  defaultParentId,
  onClose,
  onCreated,
}: {
  objectNodes: OrgNode[];
  parentNodes: OrgNode[];
  defaultParentId: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sourceObjectId, setSourceObjectId] = useState(objectNodes[0]?.id ?? 0);
  const [targetParentId, setTargetParentId] = useState(defaultParentId);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (!name.trim()) {
      setError("Вкажіть назву нового об'єкта");
      return;
    }
    setBusy(true);
    setError(null);
    fetch("/api/org-nodes/from-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceObjectId, targetParentId, name, code: code || null }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося створити об'єкт");
        onCreated();
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-md space-y-3 rounded-md border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">Створити об&rsquo;єкт за шаблоном</h3>
        <p className="text-xs text-slate-500">Скопіює відділи й штатний розпис вибраного об&rsquo;єкта в новий.</p>

        <div className="space-y-1">
          <label className="block text-xs text-slate-600">Об&rsquo;єкт-шаблон</label>
          <select value={sourceObjectId} onChange={(e) => setSourceObjectId(Number(e.target.value))} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
            {objectNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-slate-600">Куди помістити новий об&rsquo;єкт</label>
          <select value={targetParentId} onChange={(e) => setTargetParentId(Number(e.target.value))} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
            {parentNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-slate-600">Назва нового об&rsquo;єкта</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-slate-600">Код (необов&rsquo;язково)</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>

        {error && <p className="text-sm text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Скасувати
          </button>
          <button
            disabled={busy || !objectNodes.length}
            onClick={submit}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Створити
          </button>
        </div>
      </div>
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

  const [canManage, setCanManage] = useState(false);
  const [canManageVacancies, setCanManageVacancies] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<number | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);

  type DirectStaffUnit = { id: number; positionProfileId: number; positionTitle: string; plannedHeadcount: number; actualCount: number };
  const [directStaffUnits, setDirectStaffUnits] = useState<DirectStaffUnit[] | null>(null);
  const [allPositions, setAllPositions] = useState<{ id: number; title: string }[]>([]);
  const [newSuPositionId, setNewSuPositionId] = useState<number | "">("");
  const [newSuPlanned, setNewSuPlanned] = useState("1");
  const [suError, setSuError] = useState<string | null>(null);
  const [suBusyId, setSuBusyId] = useState<number | "new" | null>(null);
  const [vacancyCreatedForId, setVacancyCreatedForId] = useState<number | null>(null);

  const loadDirectStaffUnits = (nodeId: number) => {
    fetch(`/api/staff-units?orgNodeId=${nodeId}`)
      .then((r) => r.json())
      .then(setDirectStaffUnits)
      .catch(() => setDirectStaffUnits([]));
  };

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        setCanManage(!!me?.grants?.some((g: { capability: string }) => g.capability === "MANAGE_ORG_STRUCTURE"));
        setCanManageVacancies(!!me?.grants?.some((g: { capability: string }) => g.capability === "MANAGE_VACANCIES"));
      })
      .catch(() => {
        setCanManage(false);
        setCanManageVacancies(false);
      });
    fetch("/api/position-profiles")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: number; title: string }[]) => setAllPositions(list))
      .catch(() => setAllPositions([]));
  }, []);

  const loadTree = () => {
    return fetch("/api/org-tree")
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "Потрібно увійти в систему" : "Не вдалося завантажити дерево");
        return r.json();
      })
      .then((data: OrgNode[]) => {
        setNodes(data);
        setOpenIds((prev) => new Set([...prev, ...data.map((n) => n.id)]));
      });
  };

  useEffect(() => {
    loadTree()
      .then(() => {})
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (nodes && selectedId == null) {
      const root = nodes.find((n) => n.type === "COMPANY");
      setSelectedId(root ? root.id : (nodes[0]?.id ?? null));
    }
  }, [nodes, selectedId]);

  const loadStaffing = (nodeId: number) => {
    setStaffing(null);
    fetch(`/api/org-nodes/${nodeId}/staffing`)
      .then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити картку вузла");
        return r.json();
      })
      .then(setStaffing)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    if (selectedId == null) return;
    loadStaffing(selectedId);
    loadDirectStaffUnits(selectedId);
    setSuError(null);
    setNewSuPositionId("");
    setNewSuPlanned("1");
    setEditError(null);
    setMoveTargetId(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return (
      <AppShell active="/structure">
        <div className="text-sm text-rose-700">{error}</div>
      </AppShell>
    );
  }

  if (!nodes) {
    return (
      <AppShell active="/structure">
        <div className="text-sm text-slate-500">Завантаження…</div>
      </AppShell>
    );
  }

  const root = nodes.find((n) => n.parentId === null);
  const objectNodes = nodes.filter((n) => n.type === "OBJECT");
  const possibleParents = nodes.filter((n) => n.type === "DIVISION" || n.type === "COMPANY");

  const patchNode = (data: Record<string, unknown>) => {
    if (!staffing) return;
    setEditError(null);
    fetch(`/api/org-nodes/${staffing.node.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося зберегти");
        loadStaffing(staffing.node.id);
        loadTree().catch(() => {});
      })
      .catch((e) => setEditError(e.message));
  };

  const removeNode = () => {
    if (!staffing) return;
    if (!confirm(`Видалити «${staffing.node.name}» остаточно? Це можливо лише для порожнього елемента без людей та історії.`)) return;
    setEditError(null);
    const parentId = staffing.node.parentId;
    fetch(`/api/org-nodes/${staffing.node.id}`, { method: "DELETE" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося видалити");
        if (parentId) setSelectedId(parentId);
        loadTree().catch(() => {});
      })
      .catch((e) => setEditError(e.message));
  };

  const move = () => {
    if (!staffing || moveTargetId == null) return;
    setMoveBusy(true);
    setEditError(null);
    fetch(`/api/org-nodes/${staffing.node.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newParentId: moveTargetId }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося перемістити вузол");
        return loadTree();
      })
      .then(() => loadStaffing(staffing.node.id))
      .catch((e) => setEditError(e.message))
      .finally(() => setMoveBusy(false));
  };

  const createStaffUnit = () => {
    if (!staffing || newSuPositionId === "") return;
    setSuBusyId("new");
    setSuError(null);
    fetch("/api/staff-units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionProfileId: newSuPositionId, orgNodeId: staffing.node.id, plannedHeadcount: Number(newSuPlanned) || 1 }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося додати посаду");
        setNewSuPositionId("");
        setNewSuPlanned("1");
        loadDirectStaffUnits(staffing.node.id);
        loadStaffing(staffing.node.id);
      })
      .catch((e) => setSuError(e.message))
      .finally(() => setSuBusyId(null));
  };

  const updateStaffUnitPlan = (id: number, plannedHeadcount: number) => {
    if (!staffing) return;
    setSuBusyId(id);
    setSuError(null);
    fetch(`/api/staff-units/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plannedHeadcount }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося зберегти");
        loadDirectStaffUnits(staffing.node.id);
        loadStaffing(staffing.node.id);
      })
      .catch((e) => setSuError(e.message))
      .finally(() => setSuBusyId(null));
  };

  const deleteStaffUnit = (id: number) => {
    if (!staffing) return;
    setSuBusyId(id);
    setSuError(null);
    fetch(`/api/staff-units/${id}`, { method: "DELETE" })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося видалити");
        loadDirectStaffUnits(staffing.node.id);
        loadStaffing(staffing.node.id);
      })
      .catch((e) => setSuError(e.message))
      .finally(() => setSuBusyId(null));
  };

  const createVacancyForStaffUnit = (staffUnitId: number) => {
    setSuBusyId(staffUnitId);
    setSuError(null);
    fetch("/api/vacancies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffUnitId, reason: "HEADCOUNT_INCREASE" }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Не вдалося створити вакансію");
        setVacancyCreatedForId(staffUnitId);
        setTimeout(() => setVacancyCreatedForId((cur) => (cur === staffUnitId ? null : cur)), 3000);
      })
      .catch((e) => setSuError(e.message))
      .finally(() => setSuBusyId(null));
  };

  return (
    <AppShell active="/structure">
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Структура компанії</h2>
          {canManage && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowTemplate(true)}
                disabled={!objectNodes.length}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Створити об&rsquo;єкт за шаблоном
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
              >
                + Створити вузол
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="border border-slate-200 bg-white rounded-md p-2">{root && renderNode(root, 0)}</div>
          <div className="space-y-4 lg:col-span-2">
            {staffing && (
              <>
                <Section
                  title={staffing.node.name}
                  right={
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {NODE_TYPE_LABELS[staffing.node.type]} · шлях {staffing.node.path}
                      {!staffing.node.isActive && <span className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-slate-600">архівний</span>}
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

                {canManage && staffing.node.type !== "COMPANY" && (
                  <Section title="Редагування вузла">
                    <div className="grid grid-cols-2 gap-3 px-4 py-3 text-sm">
                      <div className="space-y-1">
                        <label className="block text-xs text-slate-600">Назва</label>
                        <input
                          key={`name-${staffing.node.id}`}
                          defaultValue={staffing.node.name}
                          onBlur={(e) => e.target.value.trim() && e.target.value !== staffing.node.name && patchNode({ name: e.target.value.trim() })}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs text-slate-600">Код</label>
                        <input
                          key={`code-${staffing.node.id}`}
                          defaultValue={staffing.node.code ?? ""}
                          onBlur={(e) => e.target.value !== (staffing.node.code ?? "") && patchNode({ code: e.target.value || null })}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="block text-xs text-slate-600">Адреса</label>
                        <input
                          key={`address-${staffing.node.id}`}
                          defaultValue={staffing.node.address ?? ""}
                          onBlur={(e) => e.target.value !== (staffing.node.address ?? "") && patchNode({ address: e.target.value || null })}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                        />
                      </div>

                      <div className="col-span-2 flex items-center justify-between border-t border-slate-100 pt-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={moveTargetId ?? ""}
                            onChange={(e) => setMoveTargetId(e.target.value ? Number(e.target.value) : null)}
                            className="rounded border border-slate-300 px-2 py-1 text-sm"
                          >
                            <option value="">Перемістити до…</option>
                            {possibleParents
                              .filter((n) => n.id !== staffing.node.id)
                              .map((n) => (
                                <option key={n.id} value={n.id}>
                                  {n.name}
                                </option>
                              ))}
                          </select>
                          <button
                            onClick={move}
                            disabled={moveTargetId == null || moveBusy}
                            className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
                          >
                            Перемістити
                          </button>
                        </div>
                        <button
                          onClick={() => patchNode({ isActive: !staffing.node.isActive })}
                          className={`rounded px-3 py-1.5 text-sm font-medium ${
                            staffing.node.isActive ? "border border-rose-300 text-rose-700 hover:bg-rose-50" : "border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {staffing.node.isActive ? "Архівувати" : "Активувати"}
                        </button>
                        {staffing.node.parentId !== null && (
                          <button onClick={removeNode} className="rounded border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50">
                            Видалити
                          </button>
                        )}
                      </div>
                      {editError && <p className="col-span-2 text-sm text-rose-700">{editError}</p>}
                    </div>
                  </Section>
                )}

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
                      {staffing.roster
                        .filter((r) => r.planned > 0 || r.actual > 0)
                        .map((r) => (
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

                {canManage && (
                  <Section title="Штатні одиниці цього вузла" right={<span className="text-xs text-slate-400">редагування (не по піддереву)</span>}>
                    {suError && <p className="px-4 pt-3 text-sm text-rose-700">{suError}</p>}
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="px-4 py-2 font-medium">Посада</th>
                          <th className="px-4 py-2 font-medium text-right">План</th>
                          <th className="px-4 py-2 font-medium text-right">Факт</th>
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(directStaffUnits ?? []).map((su) => (
                          <tr key={su.id} className={su.plannedHeadcount === 0 ? "bg-slate-50" : ""}>
                            <td className="px-4 py-2 text-slate-800">
                              {su.positionTitle}
                              {su.plannedHeadcount === 0 && <span className="ml-2 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-500">позицію закрито</span>}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <input
                                key={su.id + "-" + su.plannedHeadcount}
                                type="number"
                                min={0}
                                defaultValue={su.plannedHeadcount}
                                disabled={suBusyId === su.id}
                                onBlur={(e) => Number(e.target.value) !== su.plannedHeadcount && Number(e.target.value) >= 0 && updateStaffUnitPlan(su.id, Number(e.target.value))}
                                className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-right tabular-nums"
                              />
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-slate-600">{su.actualCount}</td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {canManageVacancies &&
                                  su.plannedHeadcount > 0 &&
                                  (vacancyCreatedForId === su.id ? (
                                    <span className="text-xs text-emerald-700">вакансію створено</span>
                                  ) : (
                                    <button
                                      disabled={suBusyId === su.id}
                                      onClick={() => createVacancyForStaffUnit(su.id)}
                                      title="Створити вакансію на цю посаду (напр. при зростанні плану)"
                                      className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-40"
                                    >
                                      + вакансія
                                    </button>
                                  ))}
                                {su.plannedHeadcount > 0 && su.actualCount === 0 && (
                                  <button
                                    disabled={suBusyId === su.id}
                                    onClick={() => confirm(`Закрити позицію «${su.positionTitle}»? План стане 0, посада перестане рахуватися вакансією; історія працівників збережеться.`) && updateStaffUnitPlan(su.id, 0)}
                                    title="Посада тут більше не потрібна: план 0, історія зберігається"
                                    className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-40"
                                  >
                                    закрити позицію
                                  </button>
                                )}
                                {su.plannedHeadcount === 0 && (
                                  <button
                                    disabled={suBusyId === su.id}
                                    onClick={() => updateStaffUnitPlan(su.id, 1)}
                                    className="text-xs text-emerald-700 hover:text-emerald-900 disabled:opacity-40"
                                  >
                                    відновити
                                  </button>
                                )}
                                <button
                                  disabled={suBusyId === su.id}
                                  onClick={() => deleteStaffUnit(su.id)}
                                  className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-40"
                                >
                                  видалити
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {directStaffUnits && !directStaffUnits.length && (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                              Тут ще немає власних штатних одиниць (не плутати з табличкою вище — та показує суму по всьому піддереву).
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 px-4 py-3">
                      <select
                        value={newSuPositionId}
                        onChange={(e) => setNewSuPositionId(e.target.value ? Number(e.target.value) : "")}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">Оберіть посаду…</option>
                        {allPositions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={newSuPlanned}
                        onChange={(e) => setNewSuPlanned(e.target.value)}
                        className="w-16 rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <button
                        disabled={newSuPositionId === "" || suBusyId === "new"}
                        onClick={createStaffUnit}
                        className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        Додати в штатний розпис
                      </button>
                    </div>
                  </Section>
                )}

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

      {showCreate && (
        <CreateNodeModal
          nodes={nodes}
          defaultParentId={selectedId ?? root!.id}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadTree().catch(() => {});
          }}
        />
      )}

      {showTemplate && (
        <TemplateModal
          objectNodes={objectNodes}
          parentNodes={possibleParents}
          defaultParentId={possibleParents[0]?.id ?? root!.id}
          onClose={() => setShowTemplate(false)}
          onCreated={() => {
            setShowTemplate(false);
            loadTree().catch(() => {});
          }}
        />
      )}
    </AppShell>
  );
}
