import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { getAttestationForm } from "../../../../../lib/attestation";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { instance: { include: { employment: { include: { staffUnit: true } } } } },
  });
  if (!task) return NextResponse.json({ error: "Задачу не знайдено" }, { status: 404 });

  const form = await getAttestationForm(task.instance.employment.staffUnit.positionProfileId);
  if (!form) return NextResponse.json({ error: "Форма атестації не налаштована" }, { status: 404 });

  return NextResponse.json(form);
}
