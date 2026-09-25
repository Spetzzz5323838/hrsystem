import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { sendNotification } from "./notificationTemplates";
import { getEffectiveGrants } from "./permissions";
import { hasAccess } from "./access";
import { Capability, EmploymentStatus } from "../generated/prisma/client";

/**
 * Області, де людина має MANAGE_ANNOUNCEMENTS — той самий принцип, що
 * lib/vacancies.ts::getVacancyScopePaths / lib/analytics.ts::getAnalyticsScopePaths.
 */
export async function getAnnouncementScopePaths(personId: number): Promise<string[]> {
  const grants = await getEffectiveGrants(personId);
  const paths = new Set<string>();
  for (const grant of grants) {
    if (grant.capability === Capability.MANAGE_ANNOUNCEMENTS && grant.scopePath) paths.add(grant.scopePath);
  }
  return [...paths];
}

/**
 * Оголошення (з розмови 2026-09-24, поза докс) — керівник обирає вузол
 * дерева в межах своєї дозволеної області; повідомлення йде всім активним
 * працівникам у цьому вузлі й нижче (не лише лінійному персоналу — і
 * бухгалтеру, і оператору 1С теж, якщо вони в цій області).
 */
export async function createAnnouncement(
  orgNodeId: number,
  title: string,
  body: string,
  authorId: number | null,
): Promise<{ ok: true; id: number; recipientCount: number } | { ok: false; error: string }> {
  const orgNode = await prisma.orgNode.findUnique({ where: { id: orgNodeId } });
  if (!orgNode) return { ok: false, error: "Вузол не знайдено" };
  if (!title.trim()) return { ok: false, error: "Потрібен заголовок" };
  if (!body.trim()) return { ok: false, error: "Потрібен текст оголошення" };

  const announcement = await prisma.announcement.create({
    data: { orgNodeId, title: title.trim(), body: body.trim(), authorId },
  });

  await logAudit({ actorId: authorId, action: "announcement.created", entityType: "Announcement", entityId: announcement.id, diff: { orgNodeId, title } });

  // Усі активні працевлаштування в піддереві вузла-адресата — незалежно
  // від ролі (і лінійний персонал, і бухгалтерія, і керівництво).
  const recipients = await prisma.employment.findMany({
    where: {
      status: { not: EmploymentStatus.TERMINATED },
      staffUnit: { orgNode: { OR: [{ id: orgNodeId }, { path: { startsWith: `${orgNode.path}.` } }] } },
    },
    select: { personId: true },
    distinct: ["personId"],
  });

  for (const r of recipients) {
    await sendNotification(r.personId, "announcement.posted", { title: title.trim(), body: body.trim() });
  }

  return { ok: true, id: announcement.id, recipientCount: recipients.length };
}

export async function listAnnouncementsForManagement(scopePaths: string[]) {
  return prisma.announcement.findMany({
    where: { orgNode: { OR: scopePaths.map((p) => ({ OR: [{ path: p }, { path: { startsWith: `${p}.` } }] })) } },
    include: { orgNode: true, author: { include: { person: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Оголошення, що реально стосуються цієї людини (її вузол — у межах вузла-адресата) — для /news у боті. */
export async function listAnnouncementsForPerson(personId: number, limit = 10) {
  const employments = await prisma.employment.findMany({
    where: { personId, status: { not: EmploymentStatus.TERMINATED } },
    include: { staffUnit: { include: { orgNode: true } } },
  });
  if (!employments.length) return [];

  const recent = await prisma.announcement.findMany({
    include: { orgNode: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return recent.filter((a) => employments.some((e) => hasAccess(a.orgNode.path, e.staffUnit.orgNode.path))).slice(0, limit);
}
