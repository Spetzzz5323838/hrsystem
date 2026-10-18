import { NextRequest, NextResponse } from "next/server";
import { getSessionPerson } from "../../../../../lib/auth";
import { resolveViolation } from "../../../../../lib/violations";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const result = await resolveViolation(id, session.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
