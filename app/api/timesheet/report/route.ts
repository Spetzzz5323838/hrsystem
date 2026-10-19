import { NextRequest, NextResponse } from "next/server";
import { getSessionPerson } from "../../../../lib/auth";
import { getScopePaths } from "../../../../lib/timesheet";
import { getDailyReport, listUnitOptions, parseReportParams } from "../../../../lib/timesheetReport";
import { Capability } from "../../../../generated/prisma/client";

/** Звіт по днях: ?from=2026-10-01&to=2026-10-31&unitId=5&q=Іван */
export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getScopePaths(session.id, Capability.VIEW_TIMESHEET);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до табеля" }, { status: 403 });

  const p = parseReportParams(request.nextUrl.searchParams);
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });

  const [report, units] = await Promise.all([getDailyReport(scopePaths, p.from, p.to, p.unitId, p.search), listUnitOptions(scopePaths)]);
  return NextResponse.json({ ...report, units });
}
