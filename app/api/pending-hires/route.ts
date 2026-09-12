import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { can } from "../../../lib/permissions";
import { Capability } from "../../../generated/prisma/client";

export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const pendingHires = await prisma.pendingHire.findMany({
    include: { orgNode: true },
    orderBy: { createdAt: "asc" },
  });

  const rows = [];
  for (const p of pendingHires) {
    const allowed = await can(session.id, Capability.ACTIVATE_EMPLOYEE, { orgNodePath: p.orgNode.path });
    if (!allowed) continue;
    rows.push({
      id: p.id,
      fullName: p.fullName,
      birthDate: p.birthDate,
      phone: p.phone,
      email: p.email,
      objectId: p.orgNode.id,
      objectName: p.orgNode.name,
      createdAt: p.createdAt,
    });
  }

  return NextResponse.json({ pendingHires: rows });
}
