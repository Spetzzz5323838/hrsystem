import { NextRequest, NextResponse } from "next/server";
import { readPhoto, requireInspector, savePhoto } from "../../../../../../../lib/inspectionRun";

/** Фото до оцінки (multipart, поле "file"). Фото клієнт стискає до ~1600 px перед відправкою. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; resultId: string }> }) {
  const p = await params;
  const auth = await requireInspector(Number(p.id));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Потрібен файл" }, { status: 400 });

  const result = await savePhoto(auth.inspection.id, Number(p.resultId), { buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; resultId: string }> }) {
  const p = await params;
  const auth = await requireInspector(Number(p.id));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const photo = await readPhoto(Number(p.resultId));
  if (!photo || photo.orgNodeId !== auth.inspection.orgNodeId) return NextResponse.json({ error: "Фото не знайдено" }, { status: 404 });
  return new NextResponse(new Uint8Array(photo.buffer), { headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, no-store" } });
}
