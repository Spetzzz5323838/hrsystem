import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { canManageCatalog } from "../../../../../lib/permissions";
import { recordTrainingChange } from "../../../../../lib/training";
import { Prisma } from "../../../../../generated/prisma/client";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const person = await getSessionPerson();
  if (!person) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageCatalog(person.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати навчальний профіль посади" }, { status: 403 });

  const { id } = await params;
  const positionProfileId = Number(id);
  if (!Number.isInteger(positionProfileId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const competencyId = Number(body?.competencyId);
  if (!Number.isInteger(competencyId)) return NextResponse.json({ error: "Потрібна компетенція" }, { status: 400 });

  try {
    await prisma.positionCompetency.create({ data: { positionProfileId, competencyId } });
    await recordTrainingChange({ kind: "COMPETENCY_ADDED", competencyId, positionProfileId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Цю компетенцію вже додано до профілю" }, { status: 409 });
    }
    throw error;
  }
}
