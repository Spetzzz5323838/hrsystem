import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";

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
      validMonths: c.validMonths,
      resetOnBreakMonths: c.resetOnBreakMonths,
      isBonus: c.isBonus,
      positionsUsing: c._count.positionCompetencies,
    })),
  );
}
