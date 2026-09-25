import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { canManageCatalog } from "../../../lib/permissions";
import { Prisma } from "../../../generated/prisma/client";

export async function GET() {
  const person = await getSessionPerson();
  if (!person) {
    return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  }

  const competencies = await prisma.competency.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { positionCompetencies: true } } },
  });

  return NextResponse.json(
    competencies.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      category: c.category,
      validMonths: c.validMonths,
      resetOnBreakMonths: c.resetOnBreakMonths,
      isBonus: c.isBonus,
      positionsUsing: c._count.positionCompetencies,
    })),
  );
}

export async function POST(request: NextRequest) {
  const person = await getSessionPerson();
  if (!person) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageCatalog(person.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати довідник компетенцій" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!code || !name) return NextResponse.json({ error: "Потрібні код і назва" }, { status: 400 });

  try {
    const category = typeof body?.category === "string" && body.category.trim() ? body.category.trim() : null;
    const competency = await prisma.competency.create({
      data: {
        code,
        name,
        category,
        validMonths: body?.validMonths != null ? Number(body.validMonths) : null,
        resetOnBreakMonths: body?.resetOnBreakMonths != null ? Number(body.resetOnBreakMonths) : null,
        isBonus: Boolean(body?.isBonus),
      },
    });
    return NextResponse.json({ id: competency.id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Компетенція з таким кодом уже існує" }, { status: 409 });
    }
    throw error;
  }
}
