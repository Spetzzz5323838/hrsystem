import { NextRequest, NextResponse } from "next/server";
import { requireTestEditor } from "../../../../../lib/testsAccess";
import { createQuestion } from "../../../../../lib/tests";

/** Нове питання: { text, options: string[], correctIndex }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ competencyId: string }> }) {
  const auth = await requireTestEditor();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const result = await createQuestion(Number((await params).competencyId), { text: body?.text, options: Array.isArray(body?.options) ? body.options : [], correctIndex: Number(body?.correctIndex) }, auth.actorEmploymentId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ id: result.id });
}
