import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";

export async function GET() {
  const person = await getSessionPerson();
  if (!person) {
    return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  }

  const profiles = await prisma.positionProfile.findMany({
    orderBy: [{ level: "desc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      level: true,
      canBeCurator: true,
      requiresCashierAccount: true,
      isMateriallyLiable: true,
      isFoodHandling: true,
      systemRole: true,
    },
  });

  return NextResponse.json(profiles);
}
