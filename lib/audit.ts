import { prisma } from "./prisma";
import { Prisma } from "../generated/prisma/client";

/**
 * Записує один рядок у AuditLog. actorId — Employment того, хто зробив
 * дію (null для системних). Перша ітерація покриває тільки переведення,
 * заморозку, звільнення й куратора — див. schema.prisma.
 */
export async function logAudit(entry: {
  actorId: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  diff?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      diff: entry.diff,
    },
  });
}
