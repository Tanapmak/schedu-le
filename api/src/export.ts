import ExcelJS from 'exceljs';
import { hoursReport } from './hours.js';
import { countsHours, hoursOf } from './rules/index.js';
import { resultsBySession } from './results.js';
import { monthRange } from './sessions.js';
import { listPeople, listRooms, sessionsBetween, type Db } from './store.js';

/**
 * Month workbook for payroll. It carries hours and results only, no pay rates or salaries:
 * accounting applies the pay formula. Guests (retail trainers) are left out, since they are
 * not paid through live payroll. Freelancers get their own sheet listing every live.
 */
const RED = 'FFE60012';
const BLACK = 'FF111111';

const bkk = (d: Date) => new Date(d.getTime() + 7 * 3_600_000);
const dateCell = (d: Date) => bkk(d).toISOString().slice(0, 10);
const timeCell = (d: Date) => bkk(d).toISOString().slice(11, 16);
const round2 = (n: number) => Math.round(n * 100) / 100;

function header(ws: ExcelJS.Worksheet, columns: { header: string; key: string; width: number; numFmt?: string }[]) {
  ws.columns = columns.map(({ numFmt, ...c }) => ({ ...c, style: numFmt ? { numFmt } : {} }));
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } };
  row.alignment = { vertical: 'middle' };
  row.height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

export async function payrollWorkbook(db: Db, month: string): Promise<ExcelJS.Workbook> {
  const { from, to } = monthRange(new Date(`${month}-15T00:00:00+07:00`));
  const people = new Map((await listPeople(db)).map((p) => [p.id, p]));
  const rooms = new Map((await listRooms(db)).map((r) => [r.id, r]));
  const sessions = (await sessionsBetween(db, from, to)).filter((s) => s.start >= from && s.start < to);
  const results = await resultsBySession(db, from, to);
  const hours = await hoursReport(db, month, new Date(8.64e15));

  // One line per person per session that earns hours.
  const lines = sessions.flatMap((s) =>
    s.staff
      .filter((st) => countsHours(s, st.replaced))
      .map((st) => ({ s, st, person: people.get(st.personId)!, room: rooms.get(s.roomId)!, result: results.get(s.id) }))
      .filter((l) => l.person && l.person.employment !== 'guest'),
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Schedu-le';
  wb.created = new Date();

  // ---- Summary: hours vs KPI, and GMV of own sessions for commission.
  const summary = wb.addWorksheet('Summary', { properties: { tabColor: { argb: RED } } });
  header(summary, [
    { header: 'Nickname', key: 'nickname', width: 14 },
    { header: 'Position', key: 'position', width: 10 },
    { header: 'Employment', key: 'employment', width: 12 },
    { header: 'Own-role hours', key: 'own', width: 15, numFmt: '0.0' },
    { header: 'KPI hours', key: 'kpi', width: 11, numFmt: '0' },
    { header: 'vs KPI', key: 'vs', width: 10, numFmt: '+0.0;-0.0;0' },
    { header: 'Hours over KPI', key: 'over', width: 15, numFmt: '0.0' },
    { header: 'Other-role hours (as MC)', key: 'cross', width: 22, numFmt: '0.0' },
    { header: 'Total hours', key: 'total', width: 12, numFmt: '0.0' },
    { header: 'of which cancelled, counted', key: 'cancelled', width: 24, numFmt: '0.0' },
    { header: 'Sessions', key: 'sessions', width: 10 },
    { header: 'GMV as MC (screen, pre-refund)', key: 'gmvMc', width: 28, numFmt: '#,##0' },
    { header: 'GMV as PD (screen, pre-refund)', key: 'gmvPd', width: 28, numFmt: '#,##0' },
  ]);
  for (const h of hours) {
    if (h.employment === 'guest' || h.totalHours === 0) continue;
    const mine = lines.filter((l) => l.st.personId === h.personId);
    const gmv = (role: 'mc' | 'pd') => mine.filter((l) => l.st.role === role).reduce((a, l) => a + (l.result?.gmv ?? 0), 0);
    summary.addRow({
      nickname: h.nickname,
      position: h.position.toUpperCase(),
      employment: h.employment,
      own: h.ownRoleHours,
      kpi: h.kpiHours ?? undefined,
      vs: h.vsKpi ?? undefined,
      over: h.vsKpi === null ? undefined : Math.max(0, h.vsKpi), // no deduction below KPI
      cross: h.crossRoleHours,
      total: h.totalHours,
      cancelled: h.cancelledCountedHours,
      sessions: h.sessions,
      gmvMc: round2(gmv('mc')),
      gmvPd: round2(gmv('pd')),
    });
  }
  summary.addRow([]);
  for (const note of [
    `Month ${month} (Asia/Bangkok). Sessions count in the month they start. Published sessions plus cancelled ones marked "count hours"; replaced people get no hours.`,
    'KPI applies to full-time staff only, on hours in their own position. Hours in the other role (a PD hosting as MC) have KPI 0 and are listed apart.',
    'GMV comes from PD screenshots (before refunds). Use post-refund GMV from the order export for commission.',
    'Guests (retail trainers) are left out. Freelancers are listed per live on the Freelance sheet.',
  ]) {
    summary.addRow([note]).font = { italic: true, color: { argb: 'FF666666' } };
  }

  // ---- Sessions: every line, for checking.
  const detailColumns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Start', key: 'start', width: 8 },
    { header: 'End', key: 'end', width: 8 },
    { header: 'Hours', key: 'hours', width: 8, numFmt: '0.0' },
    { header: 'Room', key: 'room', width: 9 },
    { header: 'Person', key: 'person', width: 14 },
    { header: 'Position', key: 'position', width: 10 },
    { header: 'Employment', key: 'employment', width: 12 },
    { header: 'Role in session', key: 'role', width: 15 },
    { header: 'With', key: 'with', width: 18 },
    { header: 'Status', key: 'status', width: 11 },
    { header: 'Cancel reason', key: 'reason', width: 20 },
    { header: 'GMV (screen)', key: 'gmv', width: 14, numFmt: '#,##0' },
    { header: 'Orders', key: 'orders', width: 9 },
    { header: 'Session ID', key: 'id', width: 10 },
  ];
  const detailRow = (l: (typeof lines)[number]) => ({
    date: dateCell(l.s.start),
    start: timeCell(l.s.start),
    end: timeCell(l.s.end),
    hours: round2(hoursOf(l.s)),
    room: l.room.code,
    person: l.person.nickname,
    position: l.person.position.toUpperCase(),
    employment: l.person.employment,
    role: l.st.role.toUpperCase(),
    with: l.s.staff.filter((x) => x.personId !== l.st.personId && !x.replaced).map((x) => people.get(x.personId)?.nickname).join(', '),
    status: l.s.status,
    reason: l.s.cancelReason ?? '',
    gmv: l.result ? round2(l.result.gmv) : undefined,
    orders: l.result?.orders,
    id: l.s.id,
  });
  const detail = wb.addWorksheet('Sessions');
  header(detail, detailColumns);
  for (const l of lines) detail.addRow(detailRow(l));

  // ---- Freelance: each freelancer's lives with a total, for accounting.
  const fl = wb.addWorksheet('Freelance', { properties: { tabColor: { argb: BLACK } } });
  header(fl, detailColumns);
  const freelancers = [...new Set(lines.filter((l) => l.person.employment === 'freelance').map((l) => l.st.personId))];
  for (const id of freelancers) {
    const mine = lines.filter((l) => l.st.personId === id);
    for (const l of mine) fl.addRow(detailRow(l));
    const total = fl.addRow({
      date: `Total ${people.get(id)!.nickname}`,
      hours: round2(mine.reduce((a, l) => a + hoursOf(l.s), 0)),
      room: `${mine.length} lives`,
      gmv: round2(mine.reduce((a, l) => a + (l.result?.gmv ?? 0), 0)),
    });
    total.font = { bold: true };
    total.border = { top: { style: 'thin' } };
    fl.addRow([]);
  }
  if (freelancers.length === 0) fl.addRow({ date: 'No freelance lives this month' });

  return wb;
}
