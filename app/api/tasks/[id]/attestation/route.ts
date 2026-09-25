import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { submitAttestation } from "../../../../../lib/attestation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignee: { select: { id: true, personId: true } } },
  });
  if (!task) return NextResponse.json({ error: "Задачу не знайдено" }, { status: 404 });
  if (!task.assignee || task.assignee.personId !== session.id) {
    return NextResponse.json({ error: "Цю задачу виконує інша людина" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const scores = Array.isArray(body?.scores)
    ? body.scores.map((s: { competencyId: unknown; score: unknown }) => ({ competencyId: Number(s.competencyId), score: Number(s.score) }))
    : null;
  if (!scores) return NextResponse.json({ error: "Потрібні оцінки по компетенціях" }, { status: 400 });

  const result = await submitAttestation(taskId, task.assignee.id, scores);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({ ok: true, passed: result.passed, missingRequired: result.missingRequired });
}
