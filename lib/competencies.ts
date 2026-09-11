import { prisma } from "./prisma";

export type CompetencyDeltaRow = {
  competencyId: number;
  name: string;
  validMonths: number | null;
  state: "valid" | "expired" | "missing";
  passedAt: Date | null;
  validUntil: Date | null;
};

/**
 * дельта = компетенції_посади − чинні_компетенції_людини (docs v1.2 §1).
 * Бере останній запис по кожній компетенції; якщо validUntil у минулому — "expired".
 */
export async function getCompetencyDelta(personId: number, positionProfileId: number): Promise<CompetencyDeltaRow[]> {
  const required = await prisma.positionCompetency.findMany({
    where: { positionProfileId },
    include: { competency: true },
  });

  const records = await prisma.competencyRecord.findMany({
    where: { personId, competencyId: { in: required.map((r) => r.competencyId) } },
    orderBy: { passedAt: "desc" },
  });

  const latestByCompetency = new Map<number, (typeof records)[number]>();
  for (const record of records) {
    if (!latestByCompetency.has(record.competencyId)) latestByCompetency.set(record.competencyId, record);
  }

  const now = new Date();

  return required.map((req) => {
    const record = latestByCompetency.get(req.competencyId);
    if (!record) {
      return {
        competencyId: req.competencyId,
        name: req.competency.name,
        validMonths: req.competency.validMonths,
        state: "missing" as const,
        passedAt: null,
        validUntil: null,
      };
    }

    const expired = record.validUntil != null && record.validUntil < now;
    return {
      competencyId: req.competencyId,
      name: req.competency.name,
      validMonths: req.competency.validMonths,
      state: expired ? ("expired" as const) : ("valid" as const),
      passedAt: record.passedAt,
      validUntil: record.validUntil,
    };
  });
}
