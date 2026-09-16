import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { createSession, markTrustedDevice, getLoginChallengeState, consumeLoginChallenge } from "../../../../lib/auth";

/** Опитується з /login, поки чекаємо підтвердження 2FA кнопкою в Telegram. */
export async function GET(request: NextRequest) {
  const challengeId = Number(request.nextUrl.searchParams.get("challengeId"));
  if (!Number.isFinite(challengeId)) return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });

  const state = await getLoginChallengeState(challengeId);
  if (state === "PENDING") return NextResponse.json({ status: "pending" });
  if (state === "EXPIRED" || state === "NOT_FOUND") return NextResponse.json({ status: "expired" });

  const consumed = await consumeLoginChallenge(challengeId);
  if (!consumed.ok) return NextResponse.json({ status: "expired" });

  const person = await prisma.person.findUnique({ where: { id: consumed.personId } });
  if (!person) return NextResponse.json({ status: "expired" });

  await createSession(person.id);
  await markTrustedDevice(person.id);

  return NextResponse.json({ status: "approved", id: person.id, fullName: person.fullName });
}
