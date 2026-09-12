import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../../lib/auth";
import { canManageTemplates } from "../../../../../../lib/permissions";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageTemplates(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати конструктор атестації" }, { status: 403 });

  const { id } = await params;
  const positionProfileId = Number(id);
  if (!Number.isInteger(positionProfileId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Потрібна назва розділу" }, { status: 400 });

  const template = await prisma.attestationTemplate.findUnique({ where: { positionProfileId } });
  if (!template) return NextResponse.json({ error: "Спершу створіть форму атестації для цієї посади" }, { status: 404 });

  const maxOrder = await prisma.attestationSection.aggregate({ where: { templateId: template.id }, _max: { order: true } });
  const section = await prisma.attestationSection.create({
    data: { templateId: template.id, title, order: (maxOrder._max.order ?? 0) + 1 },
  });

  return NextResponse.json({ id: section.id });
}
