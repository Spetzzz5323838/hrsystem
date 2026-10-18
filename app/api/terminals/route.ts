import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { can } from "../../../lib/permissions";
import { hasAccess } from "../../../lib/access";
import { getTerminalScopePaths, registerTerminal } from "../../../lib/terminal";
import { Capability, EmploymentStatus, OrgNodeType } from "../../../generated/prisma/client";

export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getTerminalScopePaths(session.id);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до терміналів" }, { status: 403 });

  const [terminals, objects] = await Promise.all([
    prisma.terminal.findMany({ include: { orgNode: true, registeredBy: { include: { person: true } } }, orderBy: { id: "asc" } }),
    prisma.orgNode.findMany({ where: { type: OrgNodeType.OBJECT, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const inScope = (path: string) => scopePaths.some((s) => hasAccess(s, path));

  return NextResponse.json({
    objects: objects.filter((o) => inScope(o.path)).map((o) => ({ id: o.id, name: o.name })),
    terminals: terminals
      .filter((t) => inScope(t.orgNode.path))
      .map((t) => ({
        id: t.id,
        name: t.name,
        storeName: t.orgNode.name,
        registeredByName: t.registeredBy.person.fullName,
        createdAt: t.createdAt,
        lastSeenAt: t.lastSeenAt,
        revokedAt: t.revokedAt,
      })),
  });
}

/** Реєструє ЦЕЙ комп'ютер як термінал магазину: токен ставиться в cookie тієї машини, з якої прийшов запит. */
export async function POST(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const orgNodeId = Number(body?.orgNodeId);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!Number.isInteger(orgNodeId)) return NextResponse.json({ error: "Оберіть магазин" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Вкажіть назву комп'ютера (напр. «Каса 1»)" }, { status: 400 });

  const node = await prisma.orgNode.findUnique({ where: { id: orgNodeId } });
  if (!node || node.type !== OrgNodeType.OBJECT) return NextResponse.json({ error: "Магазин не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.MANAGE_TERMINALS, { orgNodePath: node.path });
  if (!allowed) return NextResponse.json({ error: "Немає права реєструвати термінали цього магазину" }, { status: 403 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const id = await registerTerminal(orgNodeId, name, actor.id);
  return NextResponse.json({ id });
}
