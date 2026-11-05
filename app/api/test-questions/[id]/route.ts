import { NextRequest, NextResponse } from "next/server";
import { requireTestEditor } from "../../../../lib/testsAccess";
import { deleteQuestion, updateQuestion } from "../../../../lib/tests";

/** Зміна питання: { text?, options?, correctIndex?, isActive? }. Якщо на нього вже відповідали — створюється нова версія. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTestEditor();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const result = await updateQuestion(
    Number((await params).id),
    {
      text: body?.text,
      options: Array.isArray(body?.options) ? body.options : undefined,
      correctIndex: body?.correctIndex !== undefined ? Number(body.correctIndex) : undefined,
      isActive: typeof body?.isActive === "boolean" ? body.isActive : undefined,
    },
    auth.actorEmploymentId,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ id: result.id });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTestEditor();
  if (!auth.ok) return auth.response;
  const result = await deleteQuestion(Number((await params).id), auth.actorEmploymentId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, softDeleted: result.softDeleted });
}
