import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { readDocumentFile } from "../../../../../lib/documents";
import { Capability } from "../../../../../generated/prisma/client";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) return NextResponse.json({ error: "Документ не знайдено" }, { status: 404 });

  // Область для перевірки — беремо будь-яке працевлаштування цієї людини
  // (VIEW_DOCUMENTS у бухгалтера/COO — COMPANY-scope, не залежить від вузла).
  const employment = await prisma.employment.findFirst({
    where: { personId: document.personId },
    include: { staffUnit: { include: { orgNode: true } } },
    orderBy: { id: "desc" },
  });
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.VIEW_DOCUMENTS, {
    personId: document.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Скани доступні тільки бухгалтерії та керівництву" }, { status: 403 });
  }

  const buffer = await readDocumentFile(document.filePath);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(document.originalName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
