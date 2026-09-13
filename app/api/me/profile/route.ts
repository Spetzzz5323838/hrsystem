import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";

export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const employment = await prisma.employment.findFirst({
    where: { personId: session.id },
    orderBy: { id: "desc" },
    include: {
      staffUnit: { include: { positionProfile: true, orgNode: true } },
      curator: { include: { person: true } },
    },
  });
  if (!employment) return NextResponse.json({ error: "Немає працевлаштування" }, { status: 404 });

  return NextResponse.json({
    employmentId: employment.id,
    fullName: session.fullName,
    phone: session.phone,
    positionTitle: employment.staffUnit.positionProfile.title,
    objectName: employment.staffUnit.orgNode.name,
    status: employment.status,
    hiredAt: employment.hiredAt,
    curatorName: employment.curator?.person.fullName ?? null,
  });
}
