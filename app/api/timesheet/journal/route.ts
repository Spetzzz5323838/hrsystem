import { NextRequest, NextResponse } from "next/server";
import { getSessionPerson } from "../../../../lib/auth";
import { getScopePaths } from "../../../../lib/timesheet";
import { getJournal, parseJournalParams } from "../../../../lib/timesheetJournal";
import { Capability } from "../../../../generated/prisma/client";

/** Журнал правок табеля: ?month=YYYY-MM&objectId=&employmentId=&actorId=&reason=&auto=0. Доступ — як до табеля. */
export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getScopePaths(session.id, Capability.VIEW_TIMESHEET);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до табеля" }, { status: 403 });

  const parsed = parseJournalParams(request.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  return NextResponse.json(await getJournal(scopePaths, parsed.filters));
}
