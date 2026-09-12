import { promises as fs } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { Capability } from "../../../../../generated/prisma/client";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const sheetId = Number(id);
  if (!Number.isInteger(sheetId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const sheet = await prisma.clearanceSheet.findUnique({
    where: { id: sheetId },
    include: { employment: { include: { staffUnit: { include: { orgNode: true } } } } },
  });
  if (!sheet || !sheet.pdfPath) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.PRINT_CLEARANCE, {
    personId: sheet.employment.personId,
    orgNodePath: sheet.employment.staffUnit.orgNode.path,
  });
  if (!allowed) return NextResponse.json({ error: "Немає права переглядати лист узгодження" }, { status: 403 });

  const buffer = await fs.readFile(sheet.pdfPath);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(sheet.number)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
