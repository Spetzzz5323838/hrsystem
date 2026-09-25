import { NextResponse } from "next/server";
import { getSessionPerson } from "../../../../lib/auth";
import { listPollsForPerson } from "../../../../lib/polls";

/** Відкриті опитування, що стосуються сесійної людини — перегляд і голосування на вебі (правки 2026-09-25). */
export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  return NextResponse.json(await listPollsForPerson(session.id));
}
