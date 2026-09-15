import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { can } from "../../../lib/permissions";
import { Capability, EmploymentStatus, OrgNodeType, VacationStatus } from "../../../generated/prisma/client";

export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allObjects = await prisma.orgNode.findMany({ where: { type: OrgNodeType.OBJECT, isActive: true }, orderBy: { name: "asc" } });
  const visibleObjects: { id: number; name: string; path: string }[] = [];
  for (const obj of allObjects) {
    if (await can(session.id, Capability.VIEW_EMPLOYEE, { orgNodePath: obj.path })) {
      visibleObjects.push({ id: obj.id, name: obj.name, path: obj.path });
    }
  }

  const { searchParams } = new URL(request.url);
  const objectIdParam = searchParams.get("objectId");
  const objectId = objectIdParam ? Number(objectIdParam) : visibleObjects[0]?.id;
  const object = visibleObjects.find((o) => o.id === objectId);

  if (!object) {
    return NextResponse.json({ objects: visibleObjects, employees: [], pending: [], calendar: [] });
  }

  const employments = await prisma.employment.findMany({
    where: {
      status: { not: EmploymentStatus.TERMINATED },
      staffUnit: { orgNode: { OR: [{ id: object.id }, { path: { startsWith: `${object.path}.` } }] } },
    },
    include: { person: true, staffUnit: { include: { positionProfile: true } } },
  });
  const employmentIds = employments.map((e) => e.id);

  const requests = await prisma.vacationRequest.findMany({
    where: { employmentId: { in: employmentIds }, status: { in: [VacationStatus.PENDING, VacationStatus.APPROVED] } },
    orderBy: { fromDate: "asc" },
  });

  const employeeById = new Map(employments.map((e) => [e.id, e]));

  return NextResponse.json({
    objects: visibleObjects.map((o) => ({ id: o.id, name: o.name })),
    employees: employments.map((e) => ({ employmentId: e.id, fullName: e.person.fullName, positionTitle: e.staffUnit.positionProfile.title })),
    pending: requests
      .filter((r) => r.status === VacationStatus.PENDING)
      .map((r) => ({
        id: r.id,
        employmentId: r.employmentId,
        fullName: employeeById.get(r.employmentId)?.person.fullName ?? "?",
        positionTitle: employeeById.get(r.employmentId)?.staffUnit.positionProfile.title ?? "?",
        type: r.type,
        fromDate: r.fromDate,
        toDate: r.toDate,
        isOutOfSchedule: r.isOutOfSchedule,
        hasConflict: r.hasConflict,
        isCriticalPosition: r.isCriticalPosition,
        requiresEscalation: r.requiresEscalation,
        conflictNote: r.conflictNote,
      })),
    calendar: requests.map((r) => ({ employmentId: r.employmentId, fromDate: r.fromDate, toDate: r.toDate, status: r.status })),
  });
}
