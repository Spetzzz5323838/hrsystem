import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { getLatestAvatarDocument, readAvatarFile, saveAvatar } from "../../../../../lib/avatar";
import { Capability, EmploymentStatus } from "../../../../../generated/prisma/client";

async function loadEmployment(employmentId: number) {
  return prisma.employment.findUnique({ where: { id: employmentId }, include: { staffUnit: { include: { orgNode: true } } } });
}

/** Аватарка профілю (правки 20.09.2026, п.5) — вузький виняток над Document(type=PHOTO), той самий принцип, що раніше застосовувався лише для бейджа. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await loadEmployment(employmentId);
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const target = { personId: employment.personId, orgNodePath: employment.staffUnit.orgNode.path };
  const allowed = (await can(session.id, Capability.VIEW_DOCUMENTS, target)) || (await can(session.id, Capability.PRINT_BADGE, target));
  if (!allowed) return NextResponse.json({ error: "Немає права переглядати фото" }, { status: 403 });

  const photo = await getLatestAvatarDocument(employment.personId);
  if (!photo) return NextResponse.json({ error: "Фото немає" }, { status: 404 });

  const bytes = await readAvatarFile(photo.filePath);
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await loadEmployment(employmentId);
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.UPLOAD_DOCUMENTS, { personId: employment.personId, orgNodePath: employment.staffUnit.orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права завантажувати фото" }, { status: 403 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не передано" }, { status: 400 });

  const result = await saveAvatar(employment.personId, actor.id, file);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
