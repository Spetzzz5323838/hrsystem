import { NextResponse } from "next/server";
import { getSessionPerson } from "../../../lib/auth";
import { resolveScopePaths } from "../../../lib/access";
import { getEffectiveGrants } from "../../../lib/permissions";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  const person = await getSessionPerson();
  if (!person) {
    return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  }

  const [scopePaths, grants, employments] = await Promise.all([
    resolveScopePaths(person.id),
    getEffectiveGrants(person.id),
    prisma.employment.findMany({
      where: { personId: person.id },
      select: { id: true, status: true, staffUnit: { select: { positionProfile: { select: { title: true } }, orgNode: { select: { name: true } } } } },
    }),
  ]);

  return NextResponse.json({
    id: person.id,
    fullName: person.fullName,
    phone: person.phone,
    scopePaths,
    grants,
    employmentIds: employments.map((e) => e.id),
    // Посади чинних працевлаштувань — для підпису у верхній панелі
    positions: employments
      .filter((e) => e.status !== "TERMINATED")
      .map((e) => `${e.staffUnit.positionProfile.title} (${e.staffUnit.orgNode.name})`),
  });
}
