import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { getCompetencyDelta } from "../../../../lib/competencies";
import { getTrainingPlan } from "../../../../lib/training";

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
    select: { id: true, title: true, type: true, url: true, filePath: true, durationMin: true, competencyId: true },
  });

  const plan = await getTrainingPlan(session.id);
  const statusByMaterial = new Map((plan?.competencies ?? []).flatMap((c) => c.materials.map((m) => [m.id, m.status] as const)));

  return NextResponse.json({
    requiredTotal: plan?.requiredTotal ?? 0,
    requiredViewed: plan?.requiredViewed ?? 0,
    delta,
    materials: materials.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      url: m.url,
      hasFile: !!m.filePath,
      durationMin: m.durationMin,
      competencyId: m.competencyId,
      status: statusByMaterial.get(m.id) ?? "new",
    })),
  });
}
