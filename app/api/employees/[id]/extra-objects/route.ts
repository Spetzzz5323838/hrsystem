import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { canManagePermissions } from "../../../../../lib/permissions";
import { addExtraObject, getExtraObjects, removeExtraObject } from "../../../../../lib/extraObjects";
import { EmploymentStatus } from "../../../../../generated/prisma/client";

async function guard(params: Promise<{ id: string }>) {
  const session = await getSessionPerson();
  if (!session) return { error: NextResponse.json({ error: "Не залогований" }, { status: 401 }) };
  if (!(await canManagePermissions(session.id))) return { error: NextResponse.json({ error: "Немає права керувати доступами" }, { status: 403 }) };
  const employmentId = Number((await params).id);
  if (!Number.isInteger(employmentId)) return { error: NextResponse.json({ error: "Невірний id" }, { status: 400 }) };
  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  return { employmentId, actorId: actor?.id ?? null };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  const data = await getExtraObjects(g.employmentId);
  if (!data) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  return NextResponse.json(data);
}

/** { orgNodeId } — додати об'єкт. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  const body = await request.json().catch(() => null);
  const result = await addExtraObject(g.employmentId, Number(body?.orgNodeId), g.actorId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** ?assignmentId=N — прибрати додатковий об'єкт. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  const assignmentId = Number(request.nextUrl.searchParams.get("assignmentId"));
  const result = await removeExtraObject(g.employmentId, assignmentId, g.actorId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}
