import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { canManageTemplates } from "../../../../lib/permissions";
import { logAudit } from "../../../../lib/audit";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageTemplates(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати шаблони сповіщень" }, { status: 403 });

  const { id } = await params;
  const templateId = Number(id);
  if (!Number.isInteger(templateId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Текст не може бути порожнім" }, { status: 400 });

  const before = await prisma.notificationTemplate.findUnique({ where: { id: templateId } });
  if (!before) return NextResponse.json({ error: "Шаблон не знайдено" }, { status: 404 });

  await prisma.notificationTemplate.update({ where: { id: templateId }, data: { text } });

  const employment = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: "TERMINATED" } } });
  await logAudit({
    actorId: employment?.id ?? null,
    action: "notificationTemplate.updated",
    entityType: "NotificationTemplate",
    entityId: templateId,
    diff: { key: before.key, before: before.text, after: text },
  });

  return NextResponse.json({ ok: true });
}
