import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSessionPerson } from "../../../../../lib/auth";
import { getScopePaths } from "../../../../../lib/timesheet";
import { getJournal, parseJournalParams } from "../../../../../lib/timesheetJournal";
import { KIND_LABELS } from "../../../../../lib/timesheetReasons";
import { Capability } from "../../../../../generated/prisma/client";

const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const range = (a: string | null, b: string | null) => (a ? `${new Date(a).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}–${b ? new Date(b).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) : "…"}` : "");

/** Експорт журналу правок табеля в Excel (ті самі параметри, що й сторінка). */
export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getScopePaths(session.id, Capability.VIEW_TIMESHEET);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до табеля" }, { status: 403 });

  const parsed = parseJournalParams(request.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { rows } = await getJournal(scopePaths, parsed.filters);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Журнал правок табеля", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Коли виправлено", key: "createdAt", width: 18 },
    { header: "Працівник", key: "employee", width: 30 },
    { header: "Посада", key: "position", width: 22 },
    { header: "Магазин", key: "store", width: 20 },
    { header: "Дата зміни", key: "shiftDate", width: 12 },
    { header: "Вид", key: "kind", width: 16 },
    { header: "Було", key: "before", width: 14 },
    { header: "Стало", key: "after", width: 14 },
    { header: "Різниця, год", key: "delta", width: 12 },
    { header: "Причина", key: "reason", width: 38 },
    { header: "Коментар", key: "comment", width: 40 },
    { header: "Хто виправив", key: "actor", width: 26 },
    { header: "Закритий період", key: "closed", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      createdAt: fmtDateTime(r.createdAt),
      employee: r.employeeName,
      position: r.positionTitle,
      store: r.storeName,
      shiftDate: new Date(r.shiftDate).toLocaleDateString("uk-UA"),
      kind: KIND_LABELS[r.kind] ?? r.kind,
      before: range(r.beforeStartedAt, r.beforeEndedAt),
      after: range(r.afterStartedAt, r.afterEndedAt),
      delta: Math.round((r.deltaMinutes / 60) * 100) / 100,
      reason: r.reasonLabel,
      comment: r.comment ?? "",
      actor: r.actorName,
      closed: r.periodClosed ? "так" : "",
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `journal-pravok-tabelia-${parsed.filters.from.getFullYear()}-${String(parsed.filters.from.getMonth() + 1).padStart(2, "0")}.xlsx`;
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
