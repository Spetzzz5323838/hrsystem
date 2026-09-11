import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const person = await getSessionPerson();
  if (!person) {
    return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  }

  const { id } = await params;
  const profileId = Number(id);
  if (!Number.isInteger(profileId)) {
    return NextResponse.json({ error: "Невірний id профілю" }, { status: 400 });
  }

  const profile = await prisma.positionProfile.findUnique({
    where: { id: profileId },
    include: {
      positionCompetencies: {
        include: {
          competency: { include: { materials: { select: { id: true, title: true } } } },
        },
      },
    },
  });

  if (!profile) {
    return NextResponse.json({ error: "Профіль не знайдено" }, { status: 404 });
  }

  return NextResponse.json({
    id: profile.id,
    title: profile.title,
    level: profile.level,
    canBeCurator: profile.canBeCurator,
    requiresCashierAccount: profile.requiresCashierAccount,
    isMateriallyLiable: profile.isMateriallyLiable,
    isFoodHandling: profile.isFoodHandling,
    systemRole: profile.systemRole,
    competencies: profile.positionCompetencies.map((pc) => ({
      id: pc.competency.id,
      name: pc.competency.name,
      validMonths: pc.competency.validMonths,
      resetOnBreakMonths: pc.competency.resetOnBreakMonths,
      materials: pc.competency.materials,
    })),
  });
}
