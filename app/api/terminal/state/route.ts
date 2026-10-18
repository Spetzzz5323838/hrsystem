import { NextResponse } from "next/server";
import { requireTerminalOperator, listOnShift } from "../../../../lib/terminal";

export async function GET() {
  const auth = await requireTerminalOperator();
  if (!auth.ok) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });

  return NextResponse.json({
    terminalName: auth.terminal.name,
    storeName: auth.terminal.orgNode.name,
    operatorName: auth.operatorName,
    onShift: await listOnShift(auth.terminal.orgNodeId),
  });
}
