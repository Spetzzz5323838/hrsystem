import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { can } from "../../../../lib/permissions";
import { logAudit } from "../../../../lib/audit";
import { Capability, EmploymentStatus } from "../../../../generated/prisma/client";

/** Відкликання терміналу (комп'ютер вкрадено/списано/перенесено) — токен одразу перестає діяти. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const terminalId = Number((await params).id);
  if (!Number.isInteger(terminalId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const terminal = await prisma.terminal.findUnique({ where: { id: terminalId }, include: { orgNode: true } });
  if (!terminal) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  if (terminal.revokedAt) return NextResponse.json({ error: "Уже відкликано" }, { status: 409 });

  const allowed = await can(session.id, Capability.MANAGE_TERMINALS, { orgNodePath: terminal.orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права відкликати цей термінал" }, { status: 403 });

  await prisma.terminal.update({ where: { id: terminalId }, data: { revokedAt: new Date() } });
  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  await logAudit({ actorId: actor?.id ?? null, action: "terminal.revoked", entityType: "Terminal", entityId: terminalId });
  return NextResponse.json({ ok: true });
}
