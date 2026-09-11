import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { can } from "../../../lib/permissions";
import { getCompetencyDelta } from "../../../lib/competencies";
import { Capability } from "../../../generated/prisma/client";

export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) {
    return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const statusFilter = searchParams.get("status") ?? "";
  const objectIdParam = searchParams.get("objectId");
  const objectId = objectIdParam ? Number(objectIdParam) : null;

  const employments = await prisma.employment.findMany({
    include: {
      person: true,
      staffUnit: { include: { positionProfile: true, orgNode: true } },
    },
    orderBy: { id: "asc" },
  });

  const rows: {
    employmentId: number;
    personId: number;
    fullName: string;
    phone: string;
    positionTitle: string;
    objectId: number;
    objectName: string;
    status: string;
    competencyDone: number;
    competencyTotal: number;
  }[] = [];

  // Видимість — за реальними правами (VIEW_EMPLOYEE), не за жорстким фільтром.
  for (const employment of employments) {
    const allowed = await can(session.id, Capability.VIEW_EMPLOYEE, {
      personId: employment.personId,
      orgNodePath: employment.staffUnit.orgNode.path,
    });
    if (!allowed) continue;

    const delta = await getCompetencyDelta(employment.personId, employment.staffUnit.positionProfileId);
    const done = delta.filter((d) => d.state === "valid").length;

    rows.push({
      employmentId: employment.id,
      personId: employment.personId,
      fullName: employment.person.fullName,
      phone: employment.person.phone,
      positionTitle: employment.staffUnit.positionProfile.title,
      objectId: employment.staffUnit.orgNode.id,
      objectName: employment.staffUnit.orgNode.name,
      status: employment.status,
      competencyDone: done,
      competencyTotal: delta.length,
    });
  }

  const filtered = rows.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (objectId && r.objectId !== objectId) return false;
    if (q && !r.fullName.toLowerCase().includes(q) && !r.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))) return false;
    return true;
  });

  const objects = [...new Map(rows.map((r) => [r.objectId, r.objectName])).entries()].map(([id, name]) => ({ id, name }));

  return NextResponse.json({ employees: filtered, objects, total: rows.length });
}
