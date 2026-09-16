import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { createSession, verifyPassword, requiresTwoFactor, hasTrustedDevice, createLoginChallenge } from "../../../../lib/auth";
import { sendNotificationNow } from "../../../../lib/notificationTemplates";
import { logAudit } from "../../../../lib/audit";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!phone || !password) {
    return NextResponse.json({ error: "Потрібні номер телефону й пароль" }, { status: 400 });
  }

  const person = await prisma.person.findUnique({ where: { phone } });

  // Однакова відповідь на "немає такого номера" і "невірний пароль" —
  // щоб не можна було перевіряти базу підбором номерів.
  const invalid = () => NextResponse.json({ error: "Невірний номер або пароль" }, { status: 401 });

  if (!person || !person.passwordHash) return invalid();

  const ok = await verifyPassword(person.passwordHash, password);
  if (!ok) return invalid();

  if ((await requiresTwoFactor(person.id)) && !(await hasTrustedDevice(person.id))) {
    if (!person.telegramId) {
      // Telegram не прив'язаний — 2FA технічно неможливе. Узгоджено з
      // користувачем (2026-09-16): пропускаємо другий фактор, а не
      // блокуємо вхід, але лишаємо слід в AuditLog, щоб пропуск було видно.
      await createSession(person.id);
      await logAudit({ actorId: null, action: "auth.twoFactorSkippedNoTelegram", entityType: "Person", entityId: person.id });
      return NextResponse.json({ id: person.id, fullName: person.fullName });
    }

    const challengeId = await createLoginChallenge(person.id);
    try {
      // sendNotificationNow, не sendNotification — це синхронний блокуючий
      // крок входу, черга з ретраями внесла б непередбачувану затримку
      // саме там, де людина активно чекає на кнопку.
      await sendNotificationNow(person.id, "auth.loginConfirmation", { fullName: person.fullName }, {
        inline_keyboard: [[{ text: "Підтвердити вхід", callback_data: `login_confirm:${challengeId}` }]],
      });
    } catch {
      return NextResponse.json({ error: "Не вдалося надіслати підтвердження в Telegram. Спробуйте ще раз за хвилину." }, { status: 503 });
    }

    return NextResponse.json({ needsTwoFactor: true, challengeId });
  }

  await createSession(person.id);

  return NextResponse.json({ id: person.id, fullName: person.fullName });
}
