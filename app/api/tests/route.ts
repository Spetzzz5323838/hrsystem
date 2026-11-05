import { NextResponse } from "next/server";
import { requireTestEditor } from "../../../lib/testsAccess";
import { getTestOverview } from "../../../lib/tests";

/** Перелік компетенцій з кількістю активних питань тесту. */
export async function GET() {
  const auth = await requireTestEditor();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getTestOverview());
}
