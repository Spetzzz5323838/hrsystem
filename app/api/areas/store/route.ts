import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { can } from "../../../../lib/permissions";
import { logAudit } from "../../../../lib/audit";
import { parseOpenTime } from "../../../../lib/areas";
import { Capability, EmploymentStatus, OrgNodeType } from "../../../../generated/prisma/client";

/** Час відкриття магазину: { orgNodeId, openTime: "08:00" | null }. Від нього через 30 хв перевіряється, чи є персонал на ділянках. */
export async function PATCH(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const orgNodeId = Number(body?.orgNodeId);
  const node = Number.isInteger(orgNodeId) ? await prisma.orgNode.findUnique({ where: { id: orgNodeId } }) : null;
  if (!node || node.type !== OrgNodeType.OBJECT) return NextResponse.json({ error: "Магазин не знайдено" }, { status: 404 });
  if (!(await can(session.id, Capability.MANAGE_AREAS, { orgNodePath: node.path }))) return NextResponse.json({ error: "Немає права керувати ділянками цього магазину" }, { status: 403 });

  const raw = typeof body?.openTime === "string" ? body.openTime.trim() : "";
  if (raw && parseOpenTime(raw) === null) return NextResponse.json({ error: "Час відкриття має вигляд ГГ:ХХ, напр. 08:00" }, { status: 400 });

  await prisma.orgNode.update({ where: { id: orgNodeId }, data: { openTime: raw || null } });
  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  await logAudit({ actorId: actor?.id ?? null, action: "store.openTimeChanged", entityType: "OrgNode", entityId: orgNodeId, diff: { openTime: raw || null } });
  return NextResponse.json({ ok: true });
}
