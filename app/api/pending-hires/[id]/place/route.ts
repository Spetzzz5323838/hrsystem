import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSessionPerson } from "../../../../../lib/auth";
import { can } from "../../../../../lib/permissions";
import { Capability, EmploymentStatus, Prisma } from "../../../../../generated/prisma/client";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const { id } = await params;
  const pendingHireId = Number(id);
  if (!Number.isInteger(pendingHireId)) return NextResponse.json({ error: "Невірний id" }, { status: 400 });

  const pendingHire = await prisma.pendingHire.findUnique({ where: { id: pendingHireId } });
  if (!pendingHire) return NextResponse.json({ error: "Заявку не знайдено" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const staffUnitId = Number(body?.staffUnitId);
  if (!Number.isInteger(staffUnitId)) return NextResponse.json({ error: "Потрібна штатна одиниця" }, { status: 400 });

  const staffUnit = await prisma.staffUnit.findUnique({ where: { id: staffUnitId }, include: { orgNode: true } });
  if (!staffUnit) return NextResponse.json({ error: "Штатну одиницю не знайдено" }, { status: 404 });

  const allowed = await can(session.id, Capability.ACTIVATE_EMPLOYEE, { orgNodePath: staffUnit.orgNode.path });
  if (!allowed) return NextResponse.json({ error: "Немає права призначати посаду на цьому об'єкті" }, { status: 403 });

  try {
    const employmentId = await prisma.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: {
          fullName: pendingHire.fullName,
          birthDate: pendingHire.birthDate,
          phone: pendingHire.phone,
          email: pendingHire.email,
          telegramId: pendingHire.telegramId,
        },
      });
      const employment = await tx.employment.create({
        data: { personId: person.id, staffUnitId, status: EmploymentStatus.REGISTERED },
      });
      await tx.pendingHire.delete({ where: { id: pendingHireId } });
      return employment.id;
    });

    return NextResponse.json({ employmentId });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Телефон або Telegram-акаунт уже використовується в системі" }, { status: 409 });
    }
    throw error;
  }
}
