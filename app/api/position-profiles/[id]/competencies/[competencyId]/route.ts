import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../../lib/auth";
import { canManageCatalog } from "../../../../../../lib/permissions";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; competencyId: string }> }) {
  const person = await getSessionPerson();
  if (!person) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageCatalog(person.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати навчальний профіль посади" }, { status: 403 });

  const { id, competencyId } = await params;
  const positionProfileId = Number(id);
  const compId = Number(competencyId);
  if (!Number.isInteger(positionProfileId) || !Number.isInteger(compId)) {
    return NextResponse.json({ error: "Невірний id" }, { status: 400 });
  }

  await prisma.positionCompetency.deleteMany({ where: { positionProfileId, competencyId: compId } });
  return NextResponse.json({ ok: true });
}
