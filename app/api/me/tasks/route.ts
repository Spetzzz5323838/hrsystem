import { NextResponse } from "next/server";
import { getSessionPerson } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { getInstanceTasks } from "../../../../lib/onboarding";
import { getCompetencyDelta } from "../../../../lib/competencies";
import { can } from "../../../../lib/permissions";
import { Capability, EmploymentStatus, TaskStatus } from "../../../../generated/prisma/client";

/**
 * Дашборд «Мої задачі» (prototype hr-prototype-v3.jsx::TasksScreen).
 * Дві секції: (1) мої нероблені й незаблоковані пункти чек-листів по всіх
 * процесах (онбординг/переведення/звільнення), (2) компетенції в межах
 * моєї видимості (VIEW_EMPLOYEE), яким лишилось ≤2 місяці строку дії —
 * той самий сигнал, що й у прототипі. Заявки на відпустку з прототипу
 * пропущено — самої функції відпусток у системі ще немає.
 */
export async function GET() {
  const person = await getSessionPerson();
  if (!person) {
    return NextResponse.json({ error: "Не залогований" }, { status: 401 });
  }

  const myEmployments = await prisma.employment.findMany({ where: { personId: person.id }, select: { id: true } });
  const myEmploymentIds = myEmployments.map((e) => e.id);

  const pendingTasks = await prisma.task.findMany({
    where: { assigneeId: { in: myEmploymentIds }, status: TaskStatus.PENDING },
    select: { instanceId: true },
    distinct: ["instanceId"],
  });

  const myTasks: {
    taskId: number;
    employmentId: number;
    title: string;
    fullName: string;
    positionTitle: string;
    objectName: string;
    dueAt: string | null;
    overdue: boolean;
    tab: "process" | "transfer" | "termination";
  }[] = [];

  const TAB_BY_PROCESS_TYPE = { ONBOARDING: "process", TRANSFER: "transfer", OFFBOARDING: "termination" } as const;

  for (const { instanceId } of pendingTasks) {
    const [views, instance] = await Promise.all([
      getInstanceTasks(instanceId),
      prisma.processInstance.findUniqueOrThrow({
        where: { id: instanceId },
        include: {
          template: true,
          employment: { include: { person: true, staffUnit: { include: { positionProfile: true, orgNode: true } } } },
        },
      }),
    ]);

    const tab = TAB_BY_PROCESS_TYPE[instance.template.type as keyof typeof TAB_BY_PROCESS_TYPE] ?? "process";

    for (const view of views) {
      if (view.status !== TaskStatus.PENDING || view.blocked) continue;
      if (!view.assigneeId || !myEmploymentIds.includes(view.assigneeId)) continue;

      myTasks.push({
        taskId: view.taskId,
        employmentId: instance.employmentId,
        title: view.title,
        fullName: instance.employment.person.fullName,
        positionTitle: instance.employment.staffUnit.positionProfile.title,
        objectName: instance.employment.staffUnit.orgNode.name,
        dueAt: view.dueAt ? view.dueAt.toISOString() : null,
        overdue: view.overdue,
        tab,
      });
    }
  }

  myTasks.sort((a, b) => Number(b.overdue) - Number(a.overdue));

  const in2Months = new Date();
  in2Months.setMonth(in2Months.getMonth() + 2);

  const activeEmployments = await prisma.employment.findMany({
    where: { status: EmploymentStatus.ACTIVE },
    include: { person: true, staffUnit: { include: { orgNode: true, positionProfile: true } } },
  });

  const expiringCompetencies: {
    personId: number;
    fullName: string;
    competencyName: string;
    validUntil: string;
  }[] = [];

  for (const employment of activeEmployments) {
    const allowed = await can(person.id, Capability.VIEW_EMPLOYEE, {
      personId: employment.personId,
      orgNodePath: employment.staffUnit.orgNode.path,
    });
    if (!allowed) continue;

    const delta = await getCompetencyDelta(employment.personId, employment.staffUnit.positionProfileId);
    for (const row of delta) {
      if (row.state === "valid" && row.validUntil && row.validUntil <= in2Months) {
        expiringCompetencies.push({
          personId: employment.personId,
          fullName: employment.person.fullName,
          competencyName: row.name,
          validUntil: row.validUntil.toISOString(),
        });
      }
    }
  }

  expiringCompetencies.sort((a, b) => a.validUntil.localeCompare(b.validUntil));

  return NextResponse.json({ myTasks, expiringCompetencies });
}
