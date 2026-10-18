import { NextRequest, NextResponse } from "next/server";
import { completeInspection, requireInspector } from "../../../../../lib/inspectionRun";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireInspector(Number((await params).id));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await completeInspection(auth.inspection.id, auth.actor.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, violations: result.violations });
}
