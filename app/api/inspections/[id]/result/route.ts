import { NextRequest, NextResponse } from "next/server";
import { requireInspector, saveResult } from "../../../../../lib/inspectionRun";
import { InspectionRating } from "../../../../../generated/prisma/client";

/** Оцінка вимоги: { itemId, areaId?, employmentId?, rating: GREEN|YELLOW|RED, comment? }. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireInspector(Number((await params).id));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const itemId = Number(body?.itemId);
  if (!Number.isInteger(itemId)) return NextResponse.json({ error: "Невірна вимога" }, { status: 400 });

  const result = await saveResult(auth.inspection.id, {
    itemId,
    areaId: Number.isInteger(Number(body?.areaId)) && body?.areaId ? Number(body.areaId) : null,
    employmentId: Number.isInteger(Number(body?.employmentId)) && body?.employmentId ? Number(body.employmentId) : null,
    rating: body?.rating as InspectionRating,
    comment: typeof body?.comment === "string" ? body.comment : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ resultId: result.resultId });
}
