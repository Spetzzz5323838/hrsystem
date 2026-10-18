import { prisma } from "./prisma";
import { sendNotification } from "./notificationTemplates";
import { InspectionRating, InspectionStatus, RegulationTarget, ViolationStatus } from "../generated/prisma/client";

const LOOKBACK_DAYS = 14;
const MAX_LINES = 5;

/**
 * «Фокус дня» (етап 10): особисте повідомлення при прибутті на зміну. Лише
 * коли є що сказати (анти-спам — рішення власника): незакриті порушення по
 * ділянках працівника чи про нього самого та 🟡 з останнього обходу по його
 * ділянках. Один раз на добу. Не містить балів і чужих оцінок: індивідуальні
 * 🟡 інших людей сюди не потрапляють, лише ділянки й власні відкриті зауваження.
 */
export async function sendDayFocus(employmentId: number, storeOrgNodeId: number, now: Date = new Date()): Promise<boolean> {
  const employment = await prisma.employment.findUnique({ where: { id: employmentId } });
  if (!employment) return false;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const already = await prisma.notification.findFirst({ where: { recipientId: employment.personId, templateKey: "day.focus", createdAt: { gte: startOfDay } } });
  if (already) return false;

  const responsibilities = await prisma.areaResponsible.findMany({
    where: { employmentId, area: { orgNodeId: storeOrgNodeId, isActive: true } },
    include: { area: { include: { areaType: true } } },
  });
  const areaIds = responsibilities.map((r) => r.areaId);
  const areaName = new Map(responsibilities.map((r) => [r.areaId, r.area.areaType.name]));

  const violations = await prisma.violation.findMany({
    where: { orgNodeId: storeOrgNodeId, status: { not: ViolationStatus.RESOLVED }, OR: [{ areaId: { in: areaIds } }, { subjectEmploymentId: employmentId }] },
    orderBy: { createdAt: "asc" },
  });

  const lines: string[] = violations.map((v) => {
    const where = v.areaId ? `Ділянка «${areaName.get(v.areaId) ?? "—"}»` : "Ваша робота";
    return `• ${where}: ${v.text} — ${v.comment} (потрібно усунути)`;
  });

  if (areaIds.length) {
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const last = await prisma.inspection.findFirst({
      where: { orgNodeId: storeOrgNodeId, status: InspectionStatus.COMPLETED, completedAt: { gte: since } },
      orderBy: { completedAt: "desc" },
      include: { results: { where: { rating: InspectionRating.YELLOW, areaId: { in: areaIds } }, include: { item: true } } },
    });
    for (const r of last?.results ?? []) {
      if (r.item.target !== RegulationTarget.AREA) continue;
      lines.push(`• Ділянка «${areaName.get(r.areaId!) ?? "—"}»: ${r.item.text}${r.comment ? ` — ${r.comment}` : ""} (звернути увагу)`);
    }
  }

  if (!lines.length) return false;
  const shown = lines.slice(0, MAX_LINES);
  if (lines.length > MAX_LINES) shown.push(`…і ще ${lines.length - MAX_LINES}`);

  await sendNotification(employment.personId, "day.focus", { list: shown.join("\n") });
  return true;
}
