import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { canManageOrgStructure } from "../../../../lib/permissions";
import { updateOrgNode } from "../../../../lib/orgstructure";
import { EmploymentStatus } from "../../../../generated/prisma/client";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManageOrgStructure(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати оргструктуру" }, { status: 403 });
  }

  const { id } = await params;
  const nodeId = Number(id);
  if (!Number.isInteger(nodeId)) return NextResponse.json({ error: "Невірний id вузла" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });

  const result = await updateOrgNode(
    nodeId,
    {
      name: body?.name,
      code: body?.code,
      address: body?.address,
      sortOrder: body?.sortOrder != null ? Number(body.sortOrder) : undefined,
      isActive: typeof body?.isActive === "boolean" ? body.isActive : undefined,
    },
    actor?.id ?? null,
  );

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ node: result.node });
}
