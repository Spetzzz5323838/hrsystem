import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { readMaterialFile } from "../../../../../lib/materials";

/**
 * Видача файлу матеріалу — той самий принцип, що документи (файл поза
 * `public/`, тільки через цей роут), але без окремого гейту-можливості:
 * навчальні матеріали й так відкрито видаються всім залогованим
 * (GET /api/materials, /api/me/training — без capability-перевірки).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const materialId = Number(id);
  if (!Number.isInteger(materialId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material || !material.filePath) return NextResponse.json({ error: "Файл не знайдено" }, { status: 404 });

  const buffer = await readMaterialFile(material.filePath);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": material.mimeType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(material.originalName ?? material.title)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
