import { recordTrainingChange } from "../../../lib/training";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { canManageCatalog } from "../../../lib/permissions";
import { saveMaterialFile } from "../../../lib/materials";
import { MaterialType } from "../../../generated/prisma/client";

export async function GET() {
  const person = await getSessionPerson();
  if (!person) {
    return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  }

  const materials = await prisma.material.findMany({
    orderBy: { title: "asc" },
    include: { competency: { select: { name: true } }, contentUpdatedBy: { include: { person: { select: { fullName: true } } } } },
  });

  return NextResponse.json(
    materials.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      competencyId: m.competencyId,
      competencyName: m.competency.name,
      url: m.url,
      hasFile: !!m.filePath,
      durationMin: m.durationMin,
      sendViaBot: m.sendViaBot,
      contentUpdatedAt: m.contentUpdatedAt,
      contentUpdatedByName: m.contentUpdatedBy?.person.fullName ?? null,
    })),
  );
}

/**
 * Створення матеріалу — або з файлом (multipart, реальне завантаження на
 * диск сервера, спрощення для нетехнічного користувача, 2026-09-25), або
 * з посиланням (звичайний JSON, для типу "Посилання" на зовнішній ресурс).
 */
export async function POST(request: NextRequest) {
  const person = await getSessionPerson();
  if (!person) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageCatalog(person.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати довідник матеріалів" }, { status: 403 });

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const type = form.get("type");
    const competencyId = Number(form.get("competencyId"));
    const durationMinRaw = form.get("durationMin");
    const sendViaBot = form.get("sendViaBot") === "true";
    const file = form.get("file");

    if (!title) return NextResponse.json({ error: "Потрібна назва матеріалу" }, { status: 400 });
    if (!Number.isInteger(competencyId)) return NextResponse.json({ error: "Потрібна компетенція" }, { status: 400 });
    if (type !== MaterialType.PDF && type !== MaterialType.VIDEO) return NextResponse.json({ error: "Невірний тип матеріалу" }, { status: 400 });
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Потрібен файл" }, { status: 400 });

    const competency = await prisma.competency.findUnique({ where: { id: competencyId } });
    if (!competency) return NextResponse.json({ error: "Компетенцію не знайдено" }, { status: 404 });

    const result = await saveMaterialFile({
      competencyId,
      title,
      type,
      durationMin: durationMinRaw ? Number(durationMinRaw) : null,
      sendViaBot,
      file,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ id: result.id });
  }

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

  if (material.url) await recordTrainingChange({ kind: "MATERIAL_ADDED", materialId: material.id });
  return NextResponse.json({ id: material.id });
}
