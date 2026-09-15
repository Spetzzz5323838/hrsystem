import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { canManagePermissions } from "../../../../../lib/permissions";
import { setProfileCapability } from "../../../../../lib/permissionMatrix";
import { Capability, EmploymentStatus } from "../../../../../generated/prisma/client";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManagePermissions(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати права доступу" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const capability = body?.capability as string | undefined;
  const enabled = Boolean(body?.enabled);

  if (!capability || !(capability in Capability)) {
    return NextResponse.json({ error: "Невірна можливість" }, { status: 400 });
  }

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  await setProfileCapability(Number(id), capability as Capability, enabled, actor?.id ?? null);
  return NextResponse.json({ ok: true });
}
