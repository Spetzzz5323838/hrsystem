import { NextRequest, NextResponse } from "next/server";
import { getSessionPerson } from "../../../../lib/auth";
import { getAnalyticsScopePaths, getTurnoverAnalytics } from "../../../../lib/analytics";

export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getAnalyticsScopePaths(session.id);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до аналітики" }, { status: 403 });

  const monthsParam = Number(request.nextUrl.searchParams.get("months"));
  const months = Number.isFinite(monthsParam) && monthsParam > 0 ? monthsParam : 12;

  const data = await getTurnoverAnalytics(scopePaths, months);
  return NextResponse.json(data);
}
