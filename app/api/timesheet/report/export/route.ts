import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSessionPerson } from "../../../../../lib/auth";
import { getScopePaths } from "../../../../../lib/timesheet";
import { getDailyReport, parseDayKey, parseReportParams, dayKey } from "../../../../../lib/timesheetReport";
import { Capability } from "../../../../../generated/prisma/client";

const WEEKDAYS = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
/** У Excel години — числа (8,5 = 8 год 30 хв), щоб бухгалтерія могла складати формулами. */
const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

/** Експорт звіту по днях в Excel: ті самі параметри, що й /api/timesheet/report. */
export async function GET(request: NextRequest) {
  const session = await getSessionPerson();
  if (!session) return NextResponse.json({ error: "Не залогований" }, { status: 401 });

  const scopePaths = await getScopePaths(session.id, Capability.VIEW_TIMESHEET);
  if (!scopePaths.length) return NextResponse.json({ error: "Немає доступу до табеля" }, { status: 403 });

  const p = parseReportParams(request.nextUrl.searchParams);
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });

  const report = await getDailyReport(scopePaths, p.from, p.to, p.unitId, p.search);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Звіт по днях", { views: [{ state: "frozen", xSplit: 2, ySplit: 3 }] });
  const lastCol = report.days.length + 3;
  const fmtDate = (d: Date) => d.toLocaleDateString("uk-UA");

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = `Відпрацьований час: ${fmtDate(p.from)} – ${fmtDate(p.to)}`;
  ws.getCell(1, 1).font = { bold: true, size: 13 };

  // Шапка: рядок 2 — день місяця, рядок 3 — день тижня.
  const head2: (string | number)[] = ["Працівник", "Посада"];
  const head3: string[] = ["", ""];
  for (const k of report.days) {
    const d = parseDayKey(k)!;
    head2.push(d.getDate());
    head3.push(WEEKDAYS[d.getDay()]);
  }
  head2.push("Разом, год");
  head3.push("");
  ws.getRow(2).values = head2;
  ws.getRow(3).values = head3;
  ws.mergeCells(2, 1, 3, 1);
  ws.mergeCells(2, 2, 3, 2);
  ws.mergeCells(2, lastCol, 3, lastCol);
  for (const r of [2, 3]) {
    ws.getRow(r).eachCell((c) => {
      c.font = { bold: true };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECF1" } };
    });
  }
  report.days.forEach((k, i) => {
    const wd = parseDayKey(k)!.getDay();
    if (wd === 0 || wd === 6) for (const r of [2, 3]) ws.getCell(r, i + 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8D9D9" } };
  });

  const numberRow = (rowNumber: number, minutesByDay: Record<string, number>, total: number) => {
    report.days.forEach((k, i) => {
      const cell = ws.getCell(rowNumber, i + 3);
      if (minutesByDay[k]) cell.value = hours(minutesByDay[k]);
      cell.numFmt = "0.00";
      cell.alignment = { horizontal: "center" };
    });
    const t = ws.getCell(rowNumber, lastCol);
    t.value = hours(total);
    t.numFmt = "0.00";
    t.font = { bold: true };
  };

  // Групи за підрозділом (рядки вже відсортовані за деревом): заголовок із підсумками, потім працівники.
  let rowNo = 4;
  let i = 0;
  while (i < report.rows.length) {
    const unitId = report.rows[i].unitId;
    const group = report.rows.filter((r, idx) => idx >= i && r.unitId === unitId);
    const dayTotals: Record<string, number> = {};
    let total = 0;
    for (const r of group) {
      total += r.totalMinutes;
      for (const [k, v] of Object.entries(r.minutesByDay)) dayTotals[k] = (dayTotals[k] ?? 0) + v;
    }
    ws.getCell(rowNo, 1).value = `${group[0].unitName} (${group.length})`;
    numberRow(rowNo, dayTotals, total);
    ws.getRow(rowNo).font = { bold: true };
    ws.getRow(rowNo).eachCell({ includeEmpty: true }, (c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F3F6" } };
    });
    rowNo++;
    for (const r of group) {
      ws.getCell(rowNo, 1).value = r.hasOpenShift ? `${r.fullName} (зміна триває)` : r.fullName;
      ws.getCell(rowNo, 2).value = r.positionTitle;
      numberRow(rowNo, r.minutesByDay, r.totalMinutes);
      rowNo++;
    }
    i += group.length;
  }

  ws.getCell(rowNo, 1).value = "Разом за день";
  numberRow(rowNo, report.dayTotals, report.grandTotalMinutes);
  ws.getRow(rowNo).font = { bold: true };
  ws.getRow(rowNo).eachCell({ includeEmpty: true }, (c) => {
    c.border = { top: { style: "thin" } };
  });

  ws.getColumn(1).width = 38;
  ws.getColumn(2).width = 24;
  for (let c = 3; c < lastCol; c++) ws.getColumn(c).width = 6.5;
  ws.getColumn(lastCol).width = 12;

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `vidpratsovanyi-chas_${dayKey(p.from)}_${dayKey(p.to)}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
