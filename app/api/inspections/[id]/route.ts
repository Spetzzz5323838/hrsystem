import { NextRequest, NextResponse } from "next/server";
import { buildCheckpoints, requireInspector } from "../../../../lib/inspectionRun";

/** Обхід з усіма вимогами, що треба оцінити, і вже поставленими оцінками. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireInspector(Number((await params).id));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { inspection } = auth;

  const built = inspection.regulationVersionId ? await buildCheckpoints(inspection.id) : null;
  return NextResponse.json({
    id: inspection.id,
    storeName: inspection.orgNode.name,
    kind: inspection.kind,
    status: inspection.status,
    plannedFor: inspection.plannedFor,
    checkpoints: built?.checkpoints ?? [],
    notes: built?.notes ?? [],
  });
}
