import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { cancelRatingEvent } from "../../../../../lib/rating";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason : "";

  const event = await prisma.ratingEvent.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: "Запис не знайдено" }, { status: 404 });

  const myEmployments = await prisma.employment.findMany({ where: { personId: session.id }, select: { id: true } });
  const isAuthor = myEmployments.some((e) => e.id === event.authorId);
  if (!isAuthor) return NextResponse.json({ error: "Скасувати може тільки автор запису" }, { status: 403 });

  const result = await cancelRatingEvent(eventId, event.authorId, reason);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
