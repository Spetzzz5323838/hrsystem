import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { canManageCatalog } from "../../../../lib/permissions";
import { replaceMaterialFile, deleteMaterialFile } from "../../../../lib/materials";
import { MaterialType } from "../../../../generated/prisma/client";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const person = await getSessionPerson();
  if (!person) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageCatalog(person.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати довідник матеріалів" }, { status: 403 });

  const { id } = await params;
  const materialId = Number(id);
  if (!Number.isInteger(materialId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const contentType = request.headers.get("content-type") ?? "";

  // Заміна файлу (правки 2026-09-25) — окрема гілка, той самий принцип, що
  // replaceDocument у lib/documents.ts: старий файл прибирається з диска,
  // новий лягає під новим ім'ям, оновлюються тільки filePath/метадані.
  if (contentType.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Потрібен файл" }, { status: 400 });

    const result = await replaceMaterialFile(materialId, file);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ id: materialId });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : undefined;
  if (title === "") return NextResponse.json({ error: "Назва не може бути порожньою" }, { status: 400 });

  // Тип можна змінювати й після створення (правки 20.09.2026, п.9) — на
  // відміну від competencyId, який лишається незмінним назавжди тут же в
  // клієнті (не приймаємо його в PATCH узагалі, щоб не поламати вже
  // пройдені зв'язки навчання-компетенція).
  let type: MaterialType | undefined;
  if (body?.type !== undefined) {
    if (!Object.values(MaterialType).includes(body.type)) return NextResponse.json({ error: "Невірний тип матеріалу" }, { status: 400 });
    type = body.type;
  }

  const material = await prisma.material.update({
    where: { id: materialId },
    data: {
      title,
      type,
      url: body?.url !== undefined ? (typeof body.url === "string" && body.url.trim() ? body.url.trim() : null) : undefined,
      durationMin: body?.durationMin !== undefined ? (body.durationMin != null ? Number(body.durationMin) : null) : undefined,
      sendViaBot: body?.sendViaBot !== undefined ? Boolean(body.sendViaBot) : undefined,
    },
  });

  return NextResponse.json({ id: material.id });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const person = await getSessionPerson();
  if (!person) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageCatalog(person.id);
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати довідник матеріалів" }, { status: 403 });

  const { id } = await params;
  const materialId = Number(id);
  if (!Number.isInteger(materialId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) return NextResponse.json({ error: "Матеріал не знайдено" }, { status: 404 });

  if (material.filePath) await deleteMaterialFile(material.filePath);
  await prisma.material.delete({ where: { id: materialId } });
  return NextResponse.json({ ok: true });
}
