import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { canManageOrgStructure } from "../../../../../lib/permissions";
import { moveOrgNode } from "../../../../../lib/orgstructure";
import { EmploymentStatus } from "../../../../../generated/prisma/client";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManageOrgStructure(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати оргструктуру" }, { status: 403 });
  }

  const { id } = await params;
  const nodeId = Number(id);
  const body = await request.json().catch(() => null);
  const newParentId = Number(body?.newParentId);
  if (!Number.isInteger(nodeId) || !Number.isInteger(newParentId)) {
    return NextResponse.json({ error: "Невірні параметри" }, { status: 400 });
  }

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  const result = await moveOrgNode(nodeId, newParentId, actor?.id ?? null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
