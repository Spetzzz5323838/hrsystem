import { prisma } from "./prisma";
import { deleteDocumentFile } from "./documents";
import { EmploymentStatus } from "../generated/prisma/client";

/**
 * Автоочищення сканів (docs plan-v1.md §14: "скани документів — 12 місяців
 * після звільнення, далі автоочищення за розкладом"). Строк береться з
 * DocumentType.retentionMonths — якщо він не заданий, документ не чіпаємо.
 * Відлік — від дати звільнення ОСТАННЬОГО (найновішого) Employment людини:
 * якщо людину прийняли повторно після звільнення, найновіший запис уже не
 * TERMINATED, і очищення для неї не спрацює, доки вона знову не звільниться.
 * Викликається щодоби з pg-boss (bot/index.ts), як і періодичні бейджі.
 */
export async function cleanupExpiredDocuments(): Promise<{ deletedCount: number }> {
  const people = await prisma.person.findMany({
    where: { documents: { some: {} } },
    select: {
      id: true,
      employments: {
        orderBy: { id: "desc" },
        take: 1,
        select: { status: true, terminatedAt: true },
      },
    },
  });

  const now = new Date();
  let deletedCount = 0;

  for (const person of people) {
    const latest = person.employments[0];
    if (!latest || latest.status !== EmploymentStatus.TERMINATED || !latest.terminatedAt) continue;

    const documents = await prisma.document.findMany({
      where: { personId: person.id },
      include: { documentType: true },
    });

    for (const doc of documents) {
      const retentionMonths = doc.documentType.retentionMonths;
      if (retentionMonths == null) continue;

      const deadline = new Date(latest.terminatedAt);
      deadline.setMonth(deadline.getMonth() + retentionMonths);
      if (deadline > now) continue;

      await deleteDocumentFile(doc.filePath);
      await prisma.document.delete({ where: { id: doc.id } });
      await prisma.auditLog.create({
        data: {
          actorId: null,
          action: "document.retentionDeleted",
          entityType: "Document",
          entityId: doc.id,
          diff: {
            personId: person.id,
            documentTypeCode: doc.documentTypeCode,
            retentionMonths,
            terminatedAt: latest.terminatedAt,
          },
        },
      });
      deletedCount++;
    }
  }

  return { deletedCount };
}
