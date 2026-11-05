import { NextRequest, NextResponse } from "next/server";
import { requireTestEditor } from "../../../../lib/testsAccess";
import { getTestEditor, saveTestSettings } from "../../../../lib/tests";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ competencyId: string }> }) {
  const auth = await requireTestEditor();
  if (!auth.ok) return auth.response;
  const data = await getTestEditor(Number((await params).competencyId));
  if (!data) return NextResponse.json({ error: "Компетенцію не знайдено" }, { status: 404 });
  return NextResponse.json(data);
}

/** Налаштування тесту: { isActive?, questionsPerAttempt?: number|null, passPercent?, excellentPercent? }. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ competencyId: string }> }) {
  const auth = await requireTestEditor();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const num = (v: unknown) => (v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : undefined);
  const result = await saveTestSettings(
    Number((await params).competencyId),
    {
      isActive: typeof body?.isActive === "boolean" ? body.isActive : undefined,
      questionsPerAttempt: body && "questionsPerAttempt" in body ? (num(body.questionsPerAttempt) as number | null | undefined) : undefined,
      passPercent: body?.passPercent !== undefined ? Number(body.passPercent) : undefined,
      excellentPercent: body?.excellentPercent !== undefined ? Number(body.excellentPercent) : undefined,
    },
    auth.actorEmploymentId,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
