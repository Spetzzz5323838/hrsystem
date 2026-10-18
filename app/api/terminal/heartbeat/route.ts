import { NextRequest, NextResponse } from "next/server";
import { getCurrentTerminal, recordHeartbeat } from "../../../../lib/terminal";

/**
 * Сигнал "термінал живий" (раз на хвилину зі сторінки терміналу). Потрібен
 * лише cookie комп'ютера, не сесія касира: комп'ютер вважається живим, навіть
 * якщо касир ще не залогінився. Повертає серверний час — для звірки годинника.
 */
export async function POST(request: NextRequest) {
  const terminal = await getCurrentTerminal();
  if (!terminal) return NextResponse.json({ error: "Цей комп'ютер не зареєстровано як термінал" }, { status: 409 });

  const body = await request.json().catch(() => null);
  await recordHeartbeat(terminal.id, Number(body?.pending) || 0);
  return NextResponse.json({ ok: true, serverTime: new Date().toISOString() });
}
