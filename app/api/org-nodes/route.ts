import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { canManageOrgStructure } from "../../../lib/permissions";
import { createOrgNode } from "../../../lib/orgstructure";
import { EmploymentStatus, OrgNodeType } from "../../../generated/prisma/client";

async function resolveActorEmploymentId(personId: number): Promise<number | null> {
  const actor = await prisma.employment.findFirst({ where: { personId, status: { not: EmploymentStatus.TERMINATED } } });
  return actor?.id ?? null;
}

export async function POST(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManageOrgStructure(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати оргструктуру" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const type = body?.type as string | undefined;
  const name = (body?.name as string | undefined)?.trim();
  const parentId = body?.parentId != null ? Number(body.parentId) : null;

  if (!type || !(type in OrgNodeType) || !name) {
    return NextResponse.json({ error: "Потрібні тип і назва вузла" }, { status: 400 });
  }

  const actorEmploymentId = await resolveActorEmploymentId(session.id);
  const result = await createOrgNode(
    { type: type as OrgNodeType, name, code: body?.code ?? null, parentId, address: body?.address ?? null, sortOrder: body?.sortOrder },
    actorEmploymentId,
  );

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ node: result.node });
}
