import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { canManagePermissions } from "../../../lib/permissions";
import { getAccessProfiles, createAccessProfile } from "../../../lib/permissionMatrix";
import { EmploymentStatus } from "../../../generated/prisma/client";

async function resolveActorEmploymentId(personId: number): Promise<number | null> {
  const actor = await prisma.employment.findFirst({ where: { personId, status: { not: EmploymentStatus.TERMINATED } } });
  return actor?.id ?? null;
}

export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManagePermissions(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати права доступу" }, { status: 403 });
  }
  return NextResponse.json(await getAccessProfiles());
}

export async function POST(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManagePermissions(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати права доступу" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = (body?.name as string | undefined)?.trim();
  if (!name) return NextResponse.json({ error: "Потрібна назва профілю" }, { status: 400 });

  const actorEmploymentId = await resolveActorEmploymentId(session.id);
  try {
    const profile = await createAccessProfile(name, actorEmploymentId);
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: "Профіль з такою назвою вже існує" }, { status: 400 });
  }
}
