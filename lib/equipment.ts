import { prisma } from "./prisma";

/** Закріплює обладнання: якщо inventoryNo вже існує — переприв'язує, інакше створює нове. */
export async function assignEquipment(input: {
  inventoryNo: string;
  name: string;
  orgNodeId: number;
  responsibleId: number;
}) {
  const existing = await prisma.equipment.findUnique({ where: { inventoryNo: input.inventoryNo } });
  if (existing) {
    return prisma.equipment.update({
      where: { id: existing.id },
      data: { responsibleId: input.responsibleId, assignedAt: new Date(), orgNodeId: input.orgNodeId, isActive: true },
    });
  }
  return prisma.equipment.create({
    data: {
      inventoryNo: input.inventoryNo,
      name: input.name,
      orgNodeId: input.orgNodeId,
      responsibleId: input.responsibleId,
      assignedAt: new Date(),
    },
  });
}

/** Квитує обладнання — знімає відповідального (докс: ревізор при звільненні/переведенні). */
export async function clearEquipment(equipmentId: number) {
  return prisma.equipment.update({ where: { id: equipmentId }, data: { responsibleId: null, assignedAt: null } });
}
