import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";

export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const staffUnits = await prisma.staffUnit.findMany({
    include: { positionProfile: { select: { title: true } }, orgNode: { select: { name: true } } },
    orderBy: [{ orgNode: { name: "asc" } }, { positionProfile: { title: "asc" } }],
  });

  return NextResponse.json(
    staffUnits.map((su) => ({
      id: su.id,
      positionTitle: su.positionProfile.title,
      objectName: su.orgNode.name,
    })),
  );
}
