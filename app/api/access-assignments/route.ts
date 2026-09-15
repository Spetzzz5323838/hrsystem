import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { canManagePermissions } from "../../../lib/permissions";
import { getAccessAssignments, createAssignment } from "../../../lib/permissionMatrix";
import { EmploymentStatus, Role, ScopeType } from "../../../generated/prisma/client";

export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManagePermissions(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати права доступу" }, { status: 403 });
  }
  return NextResponse.json(await getAccessAssignments());
}

export async function POST(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManagePermissions(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати права доступу" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const positionProfileId = body?.positionProfileId != null ? Number(body.positionProfileId) : undefined;
  const role = body?.role as string | undefined;
  const accessProfileId = Number(body?.accessProfileId);
  const scope = body?.scope as string | undefined;

  if ((!positionProfileId && !role) || (positionProfileId && role) || !accessProfileId || !scope || !(scope in ScopeType)) {
    return NextResponse.json({ error: "Потрібні профіль, область і рівно одна ціль (посада або роль)" }, { status: 400 });
  }
  if (scope === ScopeType.CUSTOM_NODE) {
    return NextResponse.json({ error: "CUSTOM_NODE тут не підтримується — це область для окремого працівника" }, { status: 400 });
  }

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  const assignment = await createAssignment(
    positionProfileId ? { positionProfileId } : { role: role as Role },
    accessProfileId,
    scope as ScopeType,
    actor?.id ?? null,
  );
  return NextResponse.json({ assignment });
}
