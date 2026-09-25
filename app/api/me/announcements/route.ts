import { NextResponse } from "next/server";
import { getSessionPerson } from "../../../../lib/auth";
import { listAnnouncementsForPerson } from "../../../../lib/announcements";

/** Оголошення, що стосуються сесійної людини — перегляд на вебі (правки 2026-09-25). */
export async function GET() {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const announcements = await listAnnouncementsForPerson(session.id);
  return NextResponse.json(
    announcements.map((a) => ({ id: a.id, title: a.title, body: a.body, objectName: a.orgNode.name, createdAt: a.createdAt })),
  );
}
