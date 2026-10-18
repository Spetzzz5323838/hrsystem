import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireTerminalOperator } from "../../../../../lib/terminal";
import { getLatestAvatarDocument, readAvatarFile } from "../../../../../lib/avatar";

/**
 * Фото для діалогу підтвердження на терміналі (рішення 2026-10-18). Окремий
 * роут замість розширення прав на загальний avatar-роут: віддає фото лише
 * зареєстрованому терміналу + оператору з OPERATE_TERMINAL.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ employmentId: string }> }) {
  const auth = await requireTerminalOperator();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const employmentId = Number((await params).employmentId);
  if (!Number.isInteger(employmentId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const employment = await prisma.employment.findUnique({ where: { id: employmentId } });
  if (!employment) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const photo = await getLatestAvatarDocument(employment.personId);
  if (!photo) return NextResponse.json({ error: "Фото немає" }, { status: 404 });

  const bytes = await readAvatarFile(photo.filePath);
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, no-store" } });
}
