import { NextRequest, NextResponse } from "next/server";
import { requireTerminalOperator, lookupByCode } from "../../../../lib/terminal";

export async function POST(request: NextRequest) {
  const auth = await requireTerminalOperator();
  if (!auth.ok) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const result = await lookupByCode(typeof body?.code === "string" ? body.code : "");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json(result);
}
