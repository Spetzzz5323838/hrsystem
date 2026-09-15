import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { canManagePermissions } from "../../../../lib/permissions";
import { deleteAssignment } from "../../../../lib/permissionMatrix";
import { EmploymentStatus } from "../../../../generated/prisma/client";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManagePermissions(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати права доступу" }, { status: 403 });
  }

  const { id } = await params;
  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  await deleteAssignment(Number(id), actor?.id ?? null);
  return NextResponse.json({ ok: true });
}
