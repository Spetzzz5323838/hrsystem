import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { canManageTemplates } from "../../../../lib/permissions";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageTemplates(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати конструктор атестації" }, { status: 403 });

  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : undefined;
  if (title === "") return NextResponse.json({ error: "Назва не може бути порожньою" }, { status: 400 });
  const maxPoints = body?.maxPoints !== undefined ? Number(body.maxPoints) : undefined;
  if (maxPoints !== undefined && (!Number.isInteger(maxPoints) || maxPoints < 1)) {
    return NextResponse.json({ error: "Максимальний бал має бути цілим і не менше 1" }, { status: 400 });
  }

  await prisma.attestationItem.update({ where: { id: itemId }, data: { title, maxPoints } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageTemplates(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати конструктор атестації" }, { status: 403 });

  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  await prisma.attestationItem.delete({ where: { id: itemId } });
  return NextResponse.json({ ok: true });
}
