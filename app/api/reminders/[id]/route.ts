import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { setReminderDone, deleteReminder } from "../../../../lib/reminders";
import { EmploymentStatus } from "../../../../generated/prisma/client";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const reminderId = Number(id);
  if (!Number.isInteger(reminderId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (typeof body?.isDone !== "boolean") return NextResponse.json({ error: "Потрібне поле isDone" }, { status: 400 });

  const result = await setReminderDone(reminderId, actor.id, body.isDone);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const reminderId = Number(id);
  if (!Number.isInteger(reminderId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json({ error: "Не знайдено активне працевлаштування" }, { status: 400 });

  const result = await deleteReminder(reminderId, actor.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true });
}
