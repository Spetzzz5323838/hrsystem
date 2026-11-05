import { NextRequest, NextResponse } from "next/server";
import { getSessionPerson } from "../../../lib/auth";
import { canManagePermissions } from "../../../lib/permissions";
import { getEventRules, getRecentEvents, saveEventRule } from "../../../lib/events";

async function guard() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  if (!(await canManagePermissions(session.id))) return NextResponse.json({ error: "Немає права налаштовувати сповіщення" }, { status: 403 });
  return null;
}

/** Правила за замовчуванням для подій + останні події з журналу. */
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json({ rules: await getEventRules(), events: await getRecentEvents(100) });
}

export async function PUT(request: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const minLevel = Number(body?.minLevel);
  if (!body || typeof body.eventCode !== "string" || !Number.isInteger(minLevel) || minLevel < 0 || minLevel > 100) {
    return NextResponse.json({ error: "Некоректні дані правила" }, { status: 400 });
  }
  const ok = await saveEventRule(body.eventCode, { enabled: !!body.enabled, minLevel, includeAccountants: !!body.includeAccountants });
  if (!ok) return NextResponse.json({ error: "Невідома подія" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
