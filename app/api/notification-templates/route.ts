import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { canManageTemplates } from "../../../lib/permissions";

export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageTemplates(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права переглядати шаблони сповіщень" }, { status: 403 });

  const templates = await prisma.notificationTemplate.findMany({ orderBy: { key: "asc" } });
  return NextResponse.json(templates);
}
