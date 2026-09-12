import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { canManageCatalog } from "../../../lib/permissions";
import { MaterialType } from "../../../generated/prisma/client";

export async function GET() {
  const person = await getSessionPerson();
  if (!person) {
    return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  }

  const materials = await prisma.material.findMany({
    orderBy: { title: "asc" },
    include: { competency: { select: { name: true } } },
  });

  return NextResponse.json(
    materials.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      competencyId: m.competencyId,
      competencyName: m.competency.name,
      url: m.url,
      durationMin: m.durationMin,
      sendViaBot: m.sendViaBot,
    })),
  );
}

export async function POST(request: NextRequest) {
  const person = await getSessionPerson();
  if (!person) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageCatalog(person.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати довідник матеріалів" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const competencyId = Number(body?.competencyId);
  const type = body?.type;

  if (!title) return NextResponse.json({ error: "Потрібна назва матеріалу" }, { status: 400 });
  if (!Number.isInteger(competencyId)) return NextResponse.json({ error: "Потрібна компетенція" }, { status: 400 });
  if (!Object.values(MaterialType).includes(type)) return NextResponse.json({ error: "Невірний тип матеріалу" }, { status: 400 });

  const competency = await prisma.competency.findUnique({ where: { id: competencyId } });
  if (!competency) return NextResponse.json({ error: "Компетенцію не знайдено" }, { status: 404 });

  const material = await prisma.material.create({
    data: {
      title,
      type,
      competencyId,
      url: typeof body?.url === "string" && body.url.trim() ? body.url.trim() : null,
      durationMin: body?.durationMin != null ? Number(body.durationMin) : null,
      sendViaBot: Boolean(body?.sendViaBot),
    },
  });

  return NextResponse.json({ id: material.id });
}
