import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { canManageTemplates } from "../../../../../lib/permissions";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageTemplates(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати конструктор атестації" }, { status: 403 });

  const { id } = await params;
  const sectionId = Number(id);
  if (!Number.isInteger(sectionId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const maxPoints = Number(body?.maxPoints ?? 2);
  if (!title) return NextResponse.json({ error: "Потрібна назва пункту" }, { status: 400 });
  if (!Number.isInteger(maxPoints) || maxPoints < 1) return NextResponse.json({ error: "Максимальний бал має бути цілим і не менше 1" }, { status: 400 });

  const maxOrder = await prisma.attestationItem.aggregate({ where: { sectionId }, _max: { order: true } });
  const item = await prisma.attestationItem.create({
    data: { sectionId, title, maxPoints, order: (maxOrder._max.order ?? 0) + 1 },
  });

  return NextResponse.json({ id: item.id });
}
