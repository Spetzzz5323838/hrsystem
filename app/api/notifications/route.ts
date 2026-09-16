import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { canManageTemplates } from "../../../lib/permissions";

/** Журнал відправлень (docs plan-v1.md §8) — для діагностики "чи дійшло сповіщення", той самий гейт, що й редагування шаблонів. */
export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const allowed = await canManageTemplates(session.id);
  if (!allowed) return NextResponse.json({ error: "Немає права переглядати журнал сповіщень" }, { status: 403 });

  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 200 ? limitParam : 50;

  const notifications = await prisma.notification.findMany({
    orderBy: { id: "desc" },
    take: limit,
    include: { recipient: { select: { fullName: true } } },
  });

  return NextResponse.json(
    notifications.map((n) => ({
      id: n.id,
      recipientName: n.recipient.fullName,
      templateKey: n.templateKey,
      text: n.text,
      status: n.status,
      error: n.error,
      createdAt: n.createdAt,
      sentAt: n.sentAt,
    })),
  );
}
