import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";

export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const reasons = await prisma.freezeReason.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  return NextResponse.json(reasons);
}
