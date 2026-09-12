import { prisma } from "./prisma";
import { ProcessState, ProcessType, EquipmentEventType } from "../generated/prisma/client";

/** Знаходить активний (RUNNING) процес переведення чи звільнення цього працевлаштування, якщо є — щоб прив'язати подію обладнання до нього. */
async function findRunningProcessInstanceId(employmentId: number): Promise<number | null> {
  const instance = await prisma.processInstance.findFirst({
    where: { employmentId, state: ProcessState.RUNNING, template: { type: { in: [ProcessType.TRANSFER, ProcessType.OFFBOARDING] } } },
    select: { id: true },
  });
  return instance?.id ?? null;
}

/** Закріплює обладнання: якщо inventoryNo вже існує — переприв'язує, інакше створює нове. Пише подію в історію. */
export async function assignEquipment(input: {
  inventoryNo: string;
  name: string;
  orgNodeId: number;
  responsibleId: number;
  performedById: number;
}) {
  const existing = await prisma.equipment.findUnique({ where: { inventoryNo: input.inventoryNo } });
  const processInstanceId = await findRunningProcessInstanceId(input.responsibleId);

  const equipment = existing
    ? await prisma.equipment.update({
        where: { id: existing.id },
        data: { responsibleId: input.responsibleId, assignedAt: new Date(), orgNodeId: input.orgNodeId, isActive: true },
      })
    : await prisma.equipment.create({
        data: {
          inventoryNo: input.inventoryNo,
          name: input.name,
          orgNodeId: input.orgNodeId,
          responsibleId: input.responsibleId,
          assignedAt: new Date(),
        },
      });

  await prisma.equipmentEvent.create({
    data: {
      equipmentId: equipment.id,
      type: EquipmentEventType.ASSIGNED,
      employmentId: input.responsibleId,
      performedById: input.performedById,
      processInstanceId,
    },
  });

  return equipment;
}

/** Квитує обладнання — знімає відповідального (докс: ревізор при звільненні/переведенні). Пише подію в історію. */
export async function clearEquipment(equipmentId: number, performedById: number) {
  const equipment = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
  if (!equipment.responsibleId) return equipment;

  const processInstanceId = await findRunningProcessInstanceId(equipment.responsibleId);

  const updated = await prisma.equipment.update({ where: { id: equipmentId }, data: { responsibleId: null, assignedAt: null } });

  await prisma.equipmentEvent.create({
    data: {
      equipmentId,
      type: EquipmentEventType.CLEARED,
      employmentId: equipment.responsibleId,
      performedById,
      processInstanceId,
    },
  });

  return updated;
}

/** Історія квитувань/закріплень обладнання конкретного працевлаштування — для вкладки "Обладнання" й листа узгодження. */
export async function getEquipmentHistory(employmentId: number) {
  const events = await prisma.equipmentEvent.findMany({
    where: { employmentId },
    include: { equipment: true, performedBy: { include: { person: true } } },
    orderBy: { occurredAt: "desc" },
  });

  return events.map((e) => ({
    id: e.id,
    type: e.type,
    inventoryNo: e.equipment.inventoryNo,
    name: e.equipment.name,
    performedByName: e.performedBy.person.fullName,
    occurredAt: e.occurredAt,
  }));
}
