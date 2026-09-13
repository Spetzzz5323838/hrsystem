import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { getCompetencyDelta } from "../../../../lib/competencies";

export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const employment = await prisma.employment.findFirst({
    where: { personId: session.id },
    orderBy: { id: "desc" },
    include: { staffUnit: { include: { positionProfile: true } } },
  });
  if (!employment) return NextResponse.json({ error: "Немає працевлаштування" }, { status: 404 });

  const positionProfileId = employment.staffUnit.positionProfileId;
  const delta = await getCompetencyDelta(session.id, positionProfileId);

  const materials = await prisma.material.findMany({
    where: { competency: { positionCompetencies: { some: { positionProfileId } } } },
    orderBy: { title: "asc" },
    select: { id: true, title: true, type: true, url: true, durationMin: true, competencyId: true },
  });

  return NextResponse.json({ delta, materials });
}
