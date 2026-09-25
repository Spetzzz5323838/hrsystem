import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { can } from "../../../lib/permissions";
import { createPoll, listPollsForManagement } from "../../../lib/polls";
import { getAnnouncementScopePaths } from "../../../lib/announcements";
import { Capability, EmploymentStatus } from "../../../generated/prisma/client";

export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getAnnouncementScopePaths(session.id);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до опитувань" }, { status: 403 });

  return NextResponse.json(await listPollsForManagement(scopePaths));
}

/** Створення й одразу розсилка опитування (з розмови 2026-09-24). */
export async function POST(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const orgNodeId = Number(body?.orgNodeId);
  const question = typeof body?.question === "string" ? body.question : "";
  const options = Array.isArray(body?.options) ? body.options.filter((o: unknown) => typeof o === "string") : [];
  const isAnonymous = Boolean(body?.isAnonymous);
  const closesAt = typeof body?.closesAt === "string" && body.closesAt ? new Date(body.closesAt) : null;
  if (!Number.isInteger(orgNodeId)) return NextResponse.json({ error: "Потрібен вузол-адресат" }, { status: 400 });
  if (closesAt && Number.isNaN(closesAt.getTime())) return NextResponse.json({ error: "Невірний дедлайн" }, { status: 400 });

  const orgNode = await prisma.orgNode.findUnique({ where: { id: orgNodeId } });
  if (!orgNode) return NextResponse.json({ error: "Вузол не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.MANAGE_ANNOUNCEMENTS, { orgNodePath: orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права створювати опитування на цей вузол" }, { status: 403 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const result = await createPoll(orgNodeId, question, options, isAnonymous, closesAt, actor.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.id, recipientCount: result.recipientCount });
}
