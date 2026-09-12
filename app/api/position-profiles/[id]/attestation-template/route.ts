import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { canManageTemplates } from "../../../../../lib/permissions";
import { getAttestationForm } from "../../../../../lib/attestation";
import { Prisma } from "../../../../../generated/prisma/client";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const positionProfileId = Number(id);
  if (!Number.isInteger(positionProfileId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const form = await getAttestationForm(positionProfileId);
  return NextResponse.json({ form });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageTemplates(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати конструктор атестації" }, { status: 403 });

  const { id } = await params;
  const positionProfileId = Number(id);
  if (!Number.isInteger(positionProfileId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const passThresholdPercent = Number(body?.passThresholdPercent);
  if (!Number.isInteger(passThresholdPercent) || passThresholdPercent < 1 || passThresholdPercent > 100) {
    return NextResponse.json({ error: "Прохідний бал має бути від 1 до 100" }, { status: 400 });
  }

  try {
    const template = await prisma.attestationTemplate.create({ data: { positionProfileId, passThresholdPercent } });
    return NextResponse.json({ id: template.id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Для цієї посади вже є форма атестації" }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageTemplates(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати конструктор атестації" }, { status: 403 });

  const { id } = await params;
  const positionProfileId = Number(id);
  if (!Number.isInteger(positionProfileId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const passThresholdPercent = Number(body?.passThresholdPercent);
  if (!Number.isInteger(passThresholdPercent) || passThresholdPercent < 1 || passThresholdPercent > 100) {
    return NextResponse.json({ error: "Прохідний бал має бути від 1 до 100" }, { status: 400 });
  }

  await prisma.attestationTemplate.update({ where: { positionProfileId }, data: { passThresholdPercent } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageTemplates(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати конструктор атестації" }, { status: 403 });

  const { id } = await params;
  const positionProfileId = Number(id);
  if (!Number.isInteger(positionProfileId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const template = await prisma.attestationTemplate.findUnique({ where: { positionProfileId }, include: { sections: true } });
  if (!template) return NextResponse.json({ ok: true });

  await prisma.attestationItem.deleteMany({ where: { sectionId: { in: template.sections.map((s) => s.id) } } });
  await prisma.attestationSection.deleteMany({ where: { templateId: template.id } });
  await prisma.attestationTemplate.delete({ where: { id: template.id } });

  return NextResponse.json({ ok: true });
}
