import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { getSessionPerson } from "./auth";
import { canManageCatalog } from "./permissions";
import { EmploymentStatus } from "../generated/prisma/client";

/** Доступ до конструктора тестів: той, хто редагує довідник (власник, COO, сисадмін). */
export async function requireTestEditor(): Promise<{ ok: true; actorEmploymentId: number | null } | { ok: false; response: NextResponse }> {
  const session = await getSessionPerson();
  if (!session) return { ok: false, response: NextResponse.json({ error: "Не залогований" }, { status: 401 }) };
  if (!(await canManageCatalog(session.id))) return { ok: false, response: NextResponse.json({ error: "Немає права редагувати тести" }, { status: 403 }) };
  const actor = await prisma.employment.findFirst({ where: { personId: session.id, status: { not: EmploymentStatus.TERMINATED } } });
  return { ok: true, actorEmploymentId: actor?.id ?? null };
}
