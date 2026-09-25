import { NextRequest, NextResponse } from "next/server";
import { getSessionPerson } from "../../../../../../lib/auth";
import { castVote } from "../../../../../../lib/polls";

/** Голосування на вебі (правки 2026-09-25) — той самий castVote, що й callback у боті. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const pollId = Number(id);
  if (!Number.isInteger(pollId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const optionId = Number(body?.optionId);
  if (!Number.isInteger(optionId)) return NextResponse.json({ error: "Потрібен варіант відповіді" }, { status: 400 });

  const result = await castVote(pollId, optionId, session.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
