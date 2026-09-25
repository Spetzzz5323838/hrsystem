import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { canManageCatalog } from "../../../../lib/permissions";
import { Prisma } from "../../../../generated/prisma/client";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const person = await getSessionPerson();
  if (!person) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageCatalog(person.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати довідник компетенцій" }, { status: 403 });

  const { id } = await params;
  const competencyId = Number(id);
  if (!Number.isInteger(competencyId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  if (name === "") return NextResponse.json({ error: "Назва не може бути порожньою" }, { status: 400 });

  const competency = await prisma.competency.update({
    where: { id: competencyId },
    data: {
      name,
      category: body?.category !== undefined ? (typeof body.category === "string" && body.category.trim() ? body.category.trim() : null) : undefined,
      validMonths: body?.validMonths !== undefined ? (body.validMonths != null ? Number(body.validMonths) : null) : undefined,
      resetOnBreakMonths:
        body?.resetOnBreakMonths !== undefined ? (body.resetOnBreakMonths != null ? Number(body.resetOnBreakMonths) : null) : undefined,
      isBonus: body?.isBonus !== undefined ? Boolean(body.isBonus) : undefined,
    },
  });

  return NextResponse.json({ id: competency.id });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const person = await getSessionPerson();
  if (!person) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageCatalog(person.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати довідник компетенцій" }, { status: 403 });

  const { id } = await params;
  const competencyId = Number(id);
  if (!Number.isInteger(competencyId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  try {
    await prisma.competency.delete({ where: { id: competencyId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        { error: "Не можна видалити — компетенція використовується посадами, матеріалами або записами про складання" },
        { status: 409 },
      );
    }
    throw error;
  }
}
