import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { canManagePermissions } from "../../../../lib/permissions";
import { renameAccessProfile, deleteAccessProfile } from "../../../../lib/permissionMatrix";
import { EmploymentStatus } from "../../../../generated/prisma/client";

async function resolveActorEmploymentId(personId: number): Promise<number | null> {
  const actor = await prisma.employment.findFirst({ where: { personId, status: { not: EmploymentStatus.TERMINATED } } });
  return actor?.id ?? null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManagePermissions(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати права доступу" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const name = (body?.name as string | undefined)?.trim();
  if (!name) return NextResponse.json({ error: "Потрібна назва профілю" }, { status: 400 });

  const actorEmploymentId = await resolveActorEmploymentId(session.id);
  try {
    const profile = await renameAccessProfile(Number(id), name, actorEmploymentId);
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: "Не вдалося перейменувати — можливо, така назва вже є" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManagePermissions(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати права доступу" }, { status: 403 });
  }

  const { id } = await params;
  const actorEmploymentId = await resolveActorEmploymentId(session.id);
  const result = await deleteAccessProfile(Number(id), actorEmploymentId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
