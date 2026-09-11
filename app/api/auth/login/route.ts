import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { createSession, verifyPassword } from "../../../../lib/auth";

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

  await createSession(person.id);

  return NextResponse.json({ id: person.id, fullName: person.fullName });
}
