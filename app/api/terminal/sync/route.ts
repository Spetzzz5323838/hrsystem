import { NextRequest, NextResponse } from "next/server";
import { requireTerminalOperator, syncQueuedScans, listOnShift } from "../../../../lib/terminal";

/** Пакет відміток, накопичених офлайн: [{ clientEventId, code, scannedAt }]. Відповідь — результат по кожній. */
export async function POST(request: NextRequest) {
  const auth = await requireTerminalOperator();
  if (!auth.ok) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events.slice(0, 500) : [];
  const results = await syncQueuedScans(
    auth.terminal,
    auth.operatorEmploymentId,
    events.map((e: { clientEventId?: unknown; code?: unknown; scannedAt?: unknown }) => ({
      clientEventId: String(e?.clientEventId ?? ""),
      code: typeof e?.code === "string" ? e.code : "",
      scannedAt: String(e?.scannedAt ?? ""),
    })),
  );
  return NextResponse.json({ results, onShift: await listOnShift(auth.terminal.orgNodeId) });
}
