import { NextResponse } from "next/server";
import { getSessionPerson } from "../../../../lib/auth";
import { getAnalyticsScopePaths, getStaffingAnalytics } from "../../../../lib/analytics";

export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getAnalyticsScopePaths(session.id);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до аналітики" }, { status: 403 });

  const objects = await getStaffingAnalytics(scopePaths);
  return NextResponse.json({ objects });
}
