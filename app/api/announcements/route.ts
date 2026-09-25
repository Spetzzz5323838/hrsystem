import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { can } from "../../../lib/permissions";
import { createAnnouncement, listAnnouncementsForManagement, getAnnouncementScopePaths } from "../../../lib/announcements";
import { Capability, EmploymentStatus } from "../../../generated/prisma/client";

export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getAnnouncementScopePaths(session.id);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до оголошень" }, { status: 403 });

  const announcements = await listAnnouncementsForManagement(scopePaths);
  return NextResponse.json(
    announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      objectName: a.orgNode.name,
      authorName: a.author?.person.fullName ?? null,
      createdAt: a.createdAt,
    })),
  );
}

/** Створення й одразу розсилка оголошення (з розмови 2026-09-24). */
export async function POST(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const orgNodeId = Number(body?.orgNodeId);
  const title = typeof body?.title === "string" ? body.title : "";
  const text = typeof body?.body === "string" ? body.body : "";
  if (!Number.isInteger(orgNodeId)) return NextResponse.json({ error: "Потрібен вузол-адресат" }, { status: 400 });

  const orgNode = await prisma.orgNode.findUnique({ where: { id: orgNodeId } });
  if (!orgNode) return NextResponse.json({ error: "Вузол не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.MANAGE_ANNOUNCEMENTS, { orgNodePath: orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права надсилати оголошення на цей вузол" }, { status: 403 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const result = await createAnnouncement(orgNodeId, title, text, actor.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.id, recipientCount: result.recipientCount });
}
