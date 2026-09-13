import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionPerson } from "../../../../lib/auth";
import { getInstanceTasks } from "../../../../lib/onboarding";

export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const employment = await prisma.employment.findFirst({
    where: { personId: session.id },
    orderBy: { id: "desc" },
  });
  if (!employment) return NextResponse.json({ error: "Немає працевлаштування" }, { status: 404 });

  const instance = await prisma.processInstance.findFirst({
    where: { employmentId: employment.id },
    orderBy: { startedAt: "desc" },
    include: { template: true },
  });
  if (!instance) return NextResponse.json({ instance: null });

  const tasks = await getInstanceTasks(instance.id);

  return NextResponse.json({
    instance: {
      id: instance.id,
      type: instance.template.type,
      state: instance.state,
      startedAt: instance.startedAt,
      finishedAt: instance.finishedAt,
    },
    tasks,
  });
}
