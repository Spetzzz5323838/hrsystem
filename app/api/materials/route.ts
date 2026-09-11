import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";

export async function GET() {
  const person = await getSessionPerson();
  if (!person) {
    return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  }

  const materials = await prisma.material.findMany({
    orderBy: { title: "asc" },
    include: { competency: { select: { name: true } } },
  });

  return NextResponse.json(
    materials.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      competencyName: m.competency.name,
      sendViaBot: m.sendViaBot,
    })),
  );
}
