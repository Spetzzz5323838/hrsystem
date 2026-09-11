import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { saveDocument } from "../../../../../lib/documents";
import { Capability, EmploymentStatus } from "../../../../../generated/prisma/client";

async function loadEmployment(employmentId: number) {
  return prisma.employment.findUnique({
    where: { id: employmentId },
    include: { staffUnit: { include: { orgNode: true } } },
  });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await loadEmployment(employmentId);
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.VIEW_DOCUMENTS, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Скани доступні тільки бухгалтерії та керівництву" }, { status: 403 });
  }

  const documents = await prisma.document.findMany({
    where: { personId: employment.personId },
    include: { documentType: true, uploadedBy: { include: { person: true } } },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json(
    documents.map((d) => ({
      id: d.id,
      documentTypeCode: d.documentTypeCode,
      documentTypeName: d.documentType.name,
      originalName: d.originalName,
      uploadedAt: d.uploadedAt,
      uploadedByName: d.uploadedBy.person.fullName,
      expiresAt: d.expiresAt,
    })),
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const employmentId = Number(id);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await loadEmployment(employmentId);
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.UPLOAD_DOCUMENTS, {
    personId: employment.personId,
    orgNodePath: employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права завантажувати документи цього працівника" }, { status: 403 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const documentTypeCode = formData?.get("documentTypeCode");
  const expiresAtRaw = formData?.get("expiresAt");

  if (!(file instanceof File) || typeof documentTypeCode !== "string") {
    return NextResponse.json({ error: "Потрібні файл і тип документа" }, { status: 400 });
  }

  const uploaderEmployment = await prisma.employment.findFirst({
    where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } },
  });
  if (!uploaderEmployment) return NextResponse.json({ error: "У вас немає активного працевлаштування" }, { status: 400 });

  const result = await saveDocument({
    personId: employment.personId,
    documentTypeCode,
    uploadedById: uploaderEmployment.id,
    file,
    expiresAt: typeof expiresAtRaw === "string" && expiresAtRaw ? new Date(expiresAtRaw) : null,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ id: result.documentId });
}
