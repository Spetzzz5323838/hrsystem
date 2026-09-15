import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { canManageOrgStructure } from "../../../../lib/permissions";
import { createOrgNodeFromTemplate } from "../../../../lib/orgstructure";
import { EmploymentStatus } from "../../../../generated/prisma/client";

export async function POST(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManageOrgStructure(session.id))) {
    return NextResponse.json({ error: "Немає права редагувати оргструктуру" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const sourceObjectId = Number(body?.sourceObjectId);
  const targetParentId = Number(body?.targetParentId);
  const name = (body?.name as string | undefined)?.trim();

  if (!Number.isInteger(sourceObjectId) || !Number.isInteger(targetParentId) || !name) {
    return NextResponse.json({ error: "Потрібні вихідний об'єкт, цільовий вузол і назва" }, { status: 400 });
  }

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  const result = await createOrgNodeFromTemplate({ sourceObjectId, targetParentId, name, code: body?.code ?? null }, actor?.id ?? null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
