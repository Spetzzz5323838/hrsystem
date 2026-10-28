import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { findAncestorPath } from "../../../../../lib/permissions";
import { EmploymentStatus, OrgNodeType } from "../../../../../generated/prisma/client";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: { staffUnit: { include: { orgNode: true } } },
  });
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const objectPath = (await findAncestorPath(employment.staffUnit.orgNode.path, OrgNodeType.OBJECT)) ?? employment.staffUnit.orgNode.path;

  // Куратор — з цього ж об'єкта АБО зі штатної одиниці вище по дереву (директор кластера,
  // власник): інакше перший адміністратор нового магазину не мав би кого обрати куратором.
  const allCandidates = await prisma.employment.findMany({
    where: {
      id: { not: employmentId },
      status: EmploymentStatus.ACTIVE,
      staffUnit: { positionProfile: { canBeCurator: true } },
    },
    include: { person: true, staffUnit: { include: { positionProfile: true, orgNode: true } } },
  });
  const candidates = allCandidates.filter((c) => {
    const p = c.staffUnit.orgNode.path;
    return p === objectPath || objectPath.startsWith(`${p}.`);
  });

  return NextResponse.json(
    candidates.map((c) => ({
      employmentId: c.id,
      fullName: c.person.fullName,
      positionTitle: c.staffUnit.positionProfile.title,
    })),
  );
}
