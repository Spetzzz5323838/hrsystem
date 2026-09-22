import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionPerson } from "../../../lib/auth";
import { listReminders } from "../../../lib/reminders";
import { EmploymentStatus } from "../../../generated/prisma/client";

/**
 * Усі нагадування сесійної людини (правки 20.09.2026, п.7: "бачити їх у
 * списку задачі" + фільтри) — для секції "Мої нагадування" на головній.
 * `done` фільтр: не заданий = усі, "false"/"true" = лише відкриті/закриті.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!actor) return NextResponse.json([]);

  const { searchParams } = new URL(request.url);
  const doneParam = searchParams.get("done");
  const done = doneParam === "true" ? true : doneParam === "false" ? false : undefined;

  const reminders = await listReminders(actor.id, { done });
  return NextResponse.json(
    reminders.map((r) => ({
      id: r.id,
      employmentId: r.employmentId,
      fullName: r.employment.person.fullName,
      positionTitle: r.employment.staffUnit.positionProfile.title,
      objectName: r.employment.staffUnit.orgNode.name,
      text: r.text,
      dueAt: r.dueAt,
      isDone: r.isDone,
    })),
  );
}
