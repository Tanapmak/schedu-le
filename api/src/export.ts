import ExcelJS from 'exceljs';
import { hoursReport } from './hours.js';
import { creditResolver } from './credit.js';
import { hoursOf, LEAVE_REASONS, type Credit } from './rules/index.js';
import { FORGOT_RECORD_DEDUCTION, resultsBySession } from './results.js';
import { monthSummary } from './liveSummary.js';
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

export async function payrollWorkbook(db: Db, month: string, now = new Date()): Promise<ExcelJS.Workbook> {
  const { from, to } = monthRange(new Date(`${month}-15T00:00:00+07:00`));
  const people = new Map((await listPeople(db)).map((p) => [p.id, p]));
  const rooms = new Map((await listRooms(db)).map((r) => [r.id, r]));
  const sessions = (await sessionsBetween(db, from, to)).filter((s) => s.start >= from && s.start < to);
  const results = await resultsBySession(db, from, to);
  const hours = await hoursReport(db, month, now);
  const credit = await creditResolver(db, sessions, now);
  const live = await monthSummary(db, month, now, { id: 0, role: 'admin' });
  const missingOf = (personId: number) => live.byPerson.find((p) => p.personId === personId);
  const liveOf = new Map(live.sessions.map((x) => [x.id, x]));
  const charged = (sessionId: number, personId: number) => {
    const x = liveOf.get(sessionId);
    return Boolean(x && (x.status === 'missing' || x.status === 'late') && x.responsible.includes(personId));
  };
  const lastDay = dateCell(new Date(live.cutoff.getTime() - 1));
  const deductionStatus = (fined: boolean) => (fined ? 'Charged' : `Pending: record by ${lastDay}`);

  // One line per person per session that earns hours.
  const lines = sessions.flatMap((s) =>
    s.staff
      .filter((st) => credit(s, st).status === 'credited')
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
    { header: 'Pending hours (not counted yet)', key: 'pending', width: 28, numFmt: '0.0' },
    { header: 'Sessions', key: 'sessions', width: 10 },
    { header: 'GMV as MC (screen, pre-refund)', key: 'gmvMc', width: 28, numFmt: '#,##0' },
    { header: 'GMV as PD (screen, pre-refund)', key: 'gmvPd', width: 28, numFmt: '#,##0' },
    { header: 'Results not recorded', key: 'missing', width: 20 },
    { header: 'Forgot-to-record deduction (THB)', key: 'deduction', width: 30, numFmt: '#,##0' },
    { header: 'At risk if not recorded by cut-off (THB)', key: 'atRisk', width: 34, numFmt: '#,##0' },
  ]);
  for (const h of hours) {
    if (h.employment === 'guest' || (h.totalHours === 0 && h.pendingHours === 0)) continue;
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
      pending: h.pendingHours || undefined,
      sessions: h.sessions,
      gmvMc: round2(gmv('mc')),
      gmvPd: round2(gmv('pd')),
      missing: missingOf(h.personId)?.missing ?? 0,
      deduction: missingOf(h.personId)?.deduction ?? 0,
      atRisk: missingOf(h.personId)?.pendingDeduction ?? 0,
    });
  }
  summary.addRow([]);
  for (const note of [
    `Month ${month} (Asia/Bangkok). Sessions count in the month they start. Published sessions count; replaced people get no hours.`,
    'Cancelled sessions: people not on leave earn the hours. People on urgent leave earn them only for sick / accident / family emergency and only if they did not work again later that live day (until 06:00); personal errands, other reasons and normal leave earn none. Sick leave 2+ live days in a row needs a medical certificate for every day. Admin/operation overrides win. See the "Cancelled & leave" sheet.',
    '"Pending hours" are not counted yet: decided when the live day ends, or when the medical certificate arrives (by the 25th of next month).',
    'KPI applies to full-time staff only, on hours in their own position. Hours in the other role (a PD hosting as MC) have KPI 0 and are listed apart.',
    'GMV comes from PD screenshots (before refunds). Use post-refund GMV from the order export for commission.',
    'Guests (retail trainers) are left out. Freelancers are listed per live on the Freelance sheet.',
    `Results close on ${dateCell(live.cutoff)} (the 25th of the next month). Each session still without a result then costs its PD ${FORGOT_RECORD_DEDUCTION} THB (never the MC).` +
      (live.closed ? '' : ` Not closed yet at export time: "Forgot-to-record deduction" stays 0 until then and "At risk" shows what will be charged if results are still missing after ${lastDay}.`),
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
    { header: 'Hours credit', key: 'credit', width: 34 },
    { header: 'GMV (screen)', key: 'gmv', width: 14, numFmt: '#,##0' },
    { header: 'Orders', key: 'orders', width: 9 },
    { header: 'Result', key: 'result', width: 11 },
    { header: 'Forgot-to-record (THB)', key: 'deduction', width: 22, numFmt: '#,##0' },
    { header: 'Deduction status', key: 'deductionStatus', width: 26 },
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
    reason: cancelReasonText(l.s),
    credit: l.s.status === 'cancelled' ? creditText(credit(l.s, l.st), l.st.creditNote) : '',
    gmv: l.result ? round2(l.result.gmv) : undefined,
    orders: l.result?.orders,
    result: liveOf.get(l.s.id)?.status ?? '',
    // On the PD's line only. Charged once results close; until then it is what is at stake.
    ...(charged(l.s.id, l.st.personId)
      ? { deduction: FORGOT_RECORD_DEDUCTION, deductionStatus: deductionStatus(liveOf.get(l.s.id)!.fined) }
      : {}),
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

  // ---- Missing results: sessions over without a result (fined once results close).
  const miss = wb.addWorksheet('Missing results');
  header(miss, [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Start', key: 'start', width: 8 },
    { header: 'End', key: 'end', width: 8 },
    { header: 'Room', key: 'room', width: 9 },
    { header: 'MC', key: 'mc', width: 16 },
    { header: 'PD', key: 'pd', width: 16 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'PD charged', key: 'fined', width: 18 },
    { header: 'Deduction (THB)', key: 'deduction', width: 16, numFmt: '#,##0' },
    { header: 'Deduction status', key: 'deductionStatus', width: 26 },
    { header: 'Session ID', key: 'id', width: 10 },
  ]);
  const missing = live.sessions.filter((x) => x.status === 'missing' || x.status === 'late');
  for (const x of missing) {
    miss.addRow({
      date: dateCell(x.start), start: timeCell(x.start), end: timeCell(x.end), room: x.roomCode,
      mc: x.mc.join(', '), pd: x.pd.join(', '), status: x.status,
      fined: x.responsible.map((id) => people.get(id)?.nickname).join(', '),
      deduction: FORGOT_RECORD_DEDUCTION * x.responsible.length,
      deductionStatus: x.responsible.length ? deductionStatus(x.fined) : 'No PD: nobody charged',
      id: x.id,
    });
  }
  if (missing.length === 0) miss.addRow({ date: 'Every session has a result' });

  // ---- Cancelled & leave: every person on every cancelled session, and why they did or did not earn hours.
  const cx = wb.addWorksheet('Cancelled & leave');
  header(cx, [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Start', key: 'start', width: 8 },
    { header: 'End', key: 'end', width: 8 },
    { header: 'Hours', key: 'hours', width: 8, numFmt: '0.0' },
    { header: 'Room', key: 'room', width: 9 },
    { header: 'Person', key: 'person', width: 14 },
    { header: 'Role in session', key: 'role', width: 15 },
    { header: 'Cancel reason', key: 'reason', width: 26 },
    { header: 'Leave', key: 'leave', width: 22 },
    { header: 'Hours earned', key: 'earned', width: 14 },
    { header: 'Why', key: 'why', width: 60 },
    { header: 'Session ID', key: 'id', width: 10 },
  ]);
  const leaveInfo = await leaveLabels(db, from, to);
  let cancelledRows = 0;
  for (const s of sessions.filter((x) => x.status === 'cancelled')) {
    for (const st of s.staff) {
      const person = people.get(st.personId);
      if (!person || person.employment === 'guest') continue;
      const c = credit(s, st);
      cx.addRow({
        date: dateCell(s.start), start: timeCell(s.start), end: timeCell(s.end), hours: round2(hoursOf(s)),
        room: rooms.get(s.roomId)?.code, person: person.nickname, role: st.role.toUpperCase(),
        reason: cancelReasonText(s),
        leave: c.leaveId ? leaveInfo.get(c.leaveId) ?? '' : '',
        earned: c.status === 'credited' ? 'Yes' : c.status === 'pending' ? 'Pending' : 'No',
        why: creditText(c, st.creditNote),
        id: s.id,
      });
      cancelledRows += 1;
    }
  }
  if (cancelledRows === 0) cx.addRow({ date: 'No cancelled sessions this month' });

  // ---- Urgent leave: how often each person took it, by reason.
  const ul = wb.addWorksheet('Urgent leave');
  header(ul, [
    { header: 'Nickname', key: 'nickname', width: 14 },
    { header: 'Position', key: 'position', width: 10 },
    { header: 'Urgent leave', key: 'total', width: 13 },
    ...LEAVE_REASONS.map((r) => ({ header: REASON_LABEL[r], key: r, width: 16 })),
  ]);
  const { rows: urgentRows } = await db.query(
    `SELECT person_id::int, COALESCE(reason_code, 'other') AS reason, count(*)::int AS n
       FROM leave_requests
      WHERE kind = 'urgent' AND status IN ('pending', 'approved') AND lower(period) >= $1 AND lower(period) < $2
      GROUP BY 1, 2`,
    [from, to],
  );
  const byPerson = new Map<number, Record<string, number>>();
  for (const r of urgentRows) byPerson.set(r.person_id, { ...(byPerson.get(r.person_id) ?? {}), [r.reason]: r.n });
  for (const [id, counts] of [...byPerson].sort((a, b) => (people.get(a[0])?.nickname ?? '').localeCompare(people.get(b[0])?.nickname ?? ''))) {
    const p = people.get(id);
    if (!p || p.employment === 'guest') continue;
    ul.addRow({ nickname: p.nickname, position: p.position.toUpperCase(), total: Object.values(counts).reduce((a, n) => a + n, 0), ...counts });
  }
  if (byPerson.size === 0) ul.addRow({ nickname: 'No urgent leave this month' });

  return wb;
}

const REASON_LABEL: Record<string, string> = {
  sick: 'Sick',
  accident: 'Accident',
  family: 'Family emergency',
  errand: 'Personal errand',
  other: 'Other',
};

const CANCEL_LABEL: Record<string, string> = {
  leave_no_cover: 'On leave, no cover',
  force_majeure: 'Force majeure',
  meeting: 'Team meeting',
  brand: 'Brand / platform cancelled',
  other: 'Other',
};

function cancelReasonText(s: { status: string; cancelReason: string | null; cancelReasonCode: string | null }): string {
  if (s.status !== 'cancelled') return '';
  const label = s.cancelReasonCode ? CANCEL_LABEL[s.cancelReasonCode] : '';
  const text = s.cancelReason && s.cancelReason !== s.cancelReasonCode ? s.cancelReason : '';
  return [label, text].filter(Boolean).join(': ');
}

function creditText(c: Credit, note?: string | null): string {
  const day = (d?: Date) => (d ? dateCell(d) : '');
  switch (c.code) {
    case 'published': return 'Went live';
    case 'replaced': return 'Replaced: the replacement earns the hours';
    case 'override_yes': return `Given by admin/operation: ${note ?? ''}`;
    case 'override_no': return `Removed by admin/operation: ${note ?? ''}`;
    case 'cancelled_counted': return 'Not on leave: earns the hours';
    case 'cancelled_not_counted': return 'Cancelled without hours';
    case 'leave_normal': return 'On normal leave: no hours';
    case 'leave_reason_no_hours': return 'Urgent leave for a personal errand / other reason: no hours';
    case 'returned': return 'Worked again later that live day: no hours';
    case 'pending_day': return `Decided when the live day ends (${bkk(c.decidesAt!).toISOString().slice(0, 16).replace('T', ' ')})`;
    case 'pending_cert': return `Sick ${c.sickRun?.length} days in a row: needs a medical certificate by ${day(new Date(c.certDeadline!.getTime() - 1))}`;
    case 'no_cert': return `Sick ${c.sickRun?.length} days in a row, no medical certificate by the deadline: no hours`;
    case 'leave_ok': return 'Urgent leave (sick / accident / family), did not work again that day: earns the hours';
  }
}

async function leaveLabels(db: Db, from: Date, to: Date): Promise<Map<number, string>> {
  const { rows } = await db.query(
    `SELECT id::int, kind, reason_code, reason FROM leave_requests WHERE period && tstzrange($1, $2)`,
    [new Date(from.getTime() - 45 * 86_400_000), new Date(to.getTime() + 45 * 86_400_000)],
  );
  return new Map(
    rows.map((r) => [
      r.id,
      r.kind === 'urgent' ? `Urgent: ${REASON_LABEL[r.reason_code ?? 'other']}${r.reason ? ` (${r.reason})` : ''}` : 'Normal leave',
    ]),
  );
}
