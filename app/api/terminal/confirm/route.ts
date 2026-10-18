import { NextRequest, NextResponse } from "next/server";
import { requireTerminalOperator, confirmScan, listOnShift } from "../../../../lib/terminal";
import { ScanAction } from "../../../../generated/prisma/client";

export async function POST(request: NextRequest) {
  const auth = await requireTerminalOperator();
  if (!auth.ok) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const clientEventId = typeof body?.clientEventId === "string" ? body.clientEventId : "";
  const expectedAction = body?.expectedAction;
  if (!clientEventId || clientEventId.length > 64) return NextResponse.json({ error: "Потрібен clientEventId" }, { status: 400 });
  if (expectedAction !== ScanAction.ARRIVAL && expectedAction !== ScanAction.DEPARTURE) {
    return NextResponse.json({ error: "Невірна дія" }, { status: 400 });
  }

  const result = await confirmScan({
    terminal: auth.terminal,
    operatorEmploymentId: auth.operatorEmploymentId,
    code,
    clientEventId,
    expectedAction,
    confirmShort: body?.confirmShort === true,
  });
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.code ? 409 : 400 });

  return NextResponse.json({ ...result, onShift: await listOnShift(auth.terminal.orgNodeId) });
}
