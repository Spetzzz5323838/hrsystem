import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { can } from "../../../../lib/permissions";
import { closePoll } from "../../../../lib/polls";
import { Capability, EmploymentStatus } from "../../../../generated/prisma/client";

/** Закриття опитування вручну (з розмови 2026-09-24) — той самий гейт, що на створення. */
export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const pollId = Number(id);
  if (!Number.isInteger(pollId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: { orgNode: true } });
  if (!poll) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.MANAGE_ANNOUNCEMENTS, { orgNodePath: poll.orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права закривати це опитування" }, { status: 403 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const result = await closePoll(pollId, actor.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
