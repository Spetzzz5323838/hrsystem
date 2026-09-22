import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { listCuratorEligibilities, grantCuratorEligibility } from "../../../../../lib/curator";
import { Capability, EmploymentStatus } from "../../../../../generated/prisma/client";

/**
 * "Кураторство" (правки 20.09.2026, п.9) — для яких посад САМЕ ЦЯ людина
 * може бути куратором. Гейт ASSIGN_CURATOR — можливість була заведена
 * в seed (профіль "Повне управління персоналом") ще з першої сесії, коду
 * під неї не було.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const rows = await listCuratorEligibilities(employmentId);
  return NextResponse.json(rows.map((r) => ({ positionProfileId: r.positionProfileId, positionTitle: r.positionProfile.title, createdAt: r.createdAt })));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await prisma.employment.findUnique({ where: { id: employmentId }, include: { staffUnit: { include: { orgNode: true } } } });
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.ASSIGN_CURATOR, { personId: employment.personId, orgNodePath: employment.staffUnit.orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права керувати кураторством" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const positionProfileId = Number(body?.positionProfileId);
  if (!Number.isInteger(positionProfileId)) return NextResponse.json({ error: "Потрібна посада" }, { status: 400 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const result = await grantCuratorEligibility(employmentId, positionProfileId, actor.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
