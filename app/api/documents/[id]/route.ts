import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { can } from "../../../../lib/permissions";
import { deleteDocument, replaceDocument } from "../../../../lib/documents";
import { Capability, EmploymentStatus } from "../../../../generated/prisma/client";

async function checkUploadAccess(sessionPersonId: number, documentId: number) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { person: { include: { employments: { include: { staffUnit: { include: { orgNode: true } } } } } } },
  });
  if (!document) return { document: null, allowed: false };

  // Той самий принцип, що у VIEW_DOCUMENTS/GET: перевіряємо доступ через
  // будь-яке (найширше видиме) працевлаштування цієї людини.
  let allowed = false;
  for (const e of document.person.employments) {
    if (await can(sessionPersonId, Capability.UPLOAD_DOCUMENTS, { personId: document.personId, orgNodePath: e.staffUnit.orgNode.path })) {
      allowed = true;
      break;
    }
  }
  return { document, allowed };
}

/** Заміна файлу документа (правки 20.09.2026, п.9) — multipart, поле `file`. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const { document, allowed } = await checkUploadAccess(session.id, documentId);
  if (!document) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Немає права редагувати документи цього працівника" }, { status: 403 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Потрібен файл" }, { status: 400 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const result = await replaceDocument(documentId, file, actor.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.documentId });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const { document, allowed } = await checkUploadAccess(session.id, documentId);
  if (!document) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Немає права видаляти документи цього працівника" }, { status: 403 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const result = await deleteDocument(documentId, actor.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
