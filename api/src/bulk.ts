import ExcelJS from 'exceljs';
import type pg from 'pg';
import { hasErrors, type Violation } from './rules/index.js';
import { checkAgainstDb } from './sessions.js';
import { insertSession, listPeople, listRooms, sessionsBetween, type SessionInput } from './store.js';

/**
 * Many drafts at once: copying a week, or importing a sheet. Each candidate is checked
 * against the database *including the candidates saved before it*, inside one transaction,
 * so two copied sessions can't clash with each other either. Errors skip the row; warnings
 * (like the hour cap) still save, and come back so the admin sees them.
 */

const DAY_MS = 86_400_000;
const LIVE_DAY_START_H = 6; // a live day runs 06:00 to 06:00 (Bangkok); same as the web app

export interface BulkRow {
  /** Row number in the sheet, or index in the copy list. */
  row: number;
  input: SessionInput | null;
  /** Problems found before the rules ran (unknown room, bad time...). */
  problems: string[];
}

export interface BulkOutcome {
  row: number;
  ok: boolean;
  id?: number;
  start?: string;
  end?: string;
  roomId?: number;
  staff?: SessionInput['staff'];
  problems: string[];
  violations: Violation[];
}

export async function saveDrafts(pool: pg.Pool, rows: BulkRow[], opts: { dryRun: boolean; actorId?: number }): Promise<BulkOutcome[]> {
  const client = await pool.connect();
  const out: BulkOutcome[] = [];
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      const base = { row: r.row, problems: r.problems, violations: [] as Violation[] };
      if (!r.input || r.problems.length) {
        out.push({ ...base, ok: false });
        continue;
      }
      const shown = { start: r.input.start.toISOString(), end: r.input.end.toISOString(), roomId: r.input.roomId, staff: r.input.staff };
      const violations = await checkAgainstDb(client, { ...r.input, status: 'draft' });
      if (hasErrors(violations)) {
        out.push({ ...base, ...shown, ok: false, violations });
        continue;
      }
      // A savepoint per row: a lost race on the exclusion constraints skips only this row.
      await client.query('SAVEPOINT row');
      try {
        const id = await insertSession(client, r.input, opts.actorId);
        await client.query('RELEASE SAVEPOINT row');
        out.push({ ...base, ...shown, ok: true, id, violations });
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT row');
        const constraint = (err as { constraint?: string }).constraint;
        if (!constraint) throw err;
        out.push({ ...base, ...shown, ok: false, violations: [{ code: constraint.includes('room') ? 'room_busy' : 'person_busy', severity: 'error' }] });
      }
    }
    await client.query(opts.dryRun ? 'ROLLBACK' : 'COMMIT');
    if (opts.dryRun) for (const o of out) delete o.id;
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** "YYYY-MM-DD" + days. */
function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** The live day (06:00 to 06:00, Bangkok) an instant belongs to, as "YYYY-MM-DD". */
function liveDate(d: Date): string {
  return new Date(d.getTime() + 7 * 3_600_000 - LIVE_DAY_START_H * 3_600_000).toISOString().slice(0, 10);
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * Copies the live sessions of [sourceFrom, sourceTo] onto every day of [targetFrom, targetTo],
 * matching days by weekday (Monday's lives go to every target Monday). Cancelled sessions
 * are left behind; staff marked as replaced are dropped, so the copy has who actually worked.
 */
export async function copyRows(
  pool: pg.Pool,
  range: { sourceFrom: string; sourceTo: string; targetFrom: string; targetTo: string },
): Promise<BulkRow[]> {
  const bkk = (date: string, h: number) => new Date(`${date}T${String(h).padStart(2, '0')}:00:00+07:00`);
  const sessions = (await sessionsBetween(pool, bkk(range.sourceFrom, LIVE_DAY_START_H), bkk(addDays(range.sourceTo, 1), LIVE_DAY_START_H))).filter(
    (s) => s.status !== 'cancelled',
  );
  const byWeekday = new Map<number, typeof sessions>();
  for (const s of sessions) {
    const day = liveDate(new Date(s.start));
    if (day < range.sourceFrom || day > range.sourceTo) continue;
    const list = byWeekday.get(weekday(day)) ?? [];
    list.push(s);
    byWeekday.set(weekday(day), list);
  }
  const rows: BulkRow[] = [];
  for (let d = range.targetFrom; d <= range.targetTo; d = addDays(d, 1)) {
    for (const s of byWeekday.get(weekday(d)) ?? []) {
      const shift = Date.parse(`${d}T00:00:00Z`) - Date.parse(`${liveDate(new Date(s.start))}T00:00:00Z`);
      rows.push({
        row: rows.length + 1,
        problems: [],
        input: {
          roomId: s.roomId,
          start: new Date(new Date(s.start).getTime() + shift),
          end: new Date(new Date(s.end).getTime() + shift),
          location: s.location as SessionInput['location'],
          note: s.note,
          staff: s.staff.filter((x) => !x.replaced).map((x) => ({ personId: x.personId, role: x.role })),
        },
      });
    }
  }
  return rows;
}

// ---- Import from a sheet

export const IMPORT_COLUMNS = ['date', 'room', 'start', 'end', 'mc', 'pd', 'note'] as const;
const HEADERS: Record<(typeof IMPORT_COLUMNS)[number], string> = {
  date: 'วันที่ (date) YYYY-MM-DD',
  room: 'ห้อง (room)',
  start: 'เริ่ม (start) HH:MM',
  end: 'จบ (end) HH:MM',
  mc: 'MC',
  pd: 'PD',
  note: 'หมายเหตุ (note)',
};

/** A blank template with the room codes and nicknames listed on a second sheet. */
export async function importTemplate(pool: pg.Pool): Promise<ExcelJS.Workbook> {
  const [rooms, people] = [await listRooms(pool), await listPeople(pool)];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('schedule');
  ws.columns = IMPORT_COLUMNS.map((k) => ({ header: HEADERS[k], key: k, width: k === 'note' ? 30 : k === 'date' ? 24 : 14 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.addRow({ date: '2026-12-01', room: rooms[0]?.code ?? 'TTS 1', start: '10:00', end: '12:00', mc: '', pd: '', note: 'ตัวอย่าง ลบแถวนี้ได้ (example row)' });
  ws.getColumn('date').numFmt = '@';
  ws.getColumn('start').numFmt = '@';
  ws.getColumn('end').numFmt = '@';
  const help = wb.addWorksheet('lists');
  help.columns = [
    { header: 'ห้อง (room)', key: 'room', width: 14 },
    { header: 'MC', key: 'mc', width: 18 },
    { header: 'PD', key: 'pd', width: 18 },
  ];
  help.getRow(1).font = { bold: true };
  const active = people.filter((p) => p.isActive);
  const mcs = active.filter((p) => p.position === 'mc' || p.position === 'operation').map((p) => p.nickname);
  const pds = active.filter((p) => p.position === 'pd' || p.position === 'operation').map((p) => p.nickname);
  const roomCodes = rooms.filter((r) => r.isActive).map((r) => r.code);
  for (let i = 0; i < Math.max(roomCodes.length, mcs.length, pds.length); i++) help.addRow({ room: roomCodes[i], mc: mcs[i], pd: pds[i] });
  help.addRow({});
  help.addRow({ room: 'เวลา 00:00–05:59 = คืนของวันที่ในแถว (ข้ามเที่ยงคืน)' });
  return wb;
}

/** Text of a cell, whatever Excel stored it as (dates and times become strings). */
function cellText(v: ExcelJS.CellValue, kind: 'date' | 'time' | 'text'): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    // Excel keeps dates and times as UTC-midnight-based serials with no zone.
    const iso = v.toISOString();
    return kind === 'time' ? iso.slice(11, 16) : iso.slice(0, 10);
  }
  if (typeof v === 'number' && kind === 'time' && v < 1) {
    const min = Math.round(v * 24 * 60);
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }
  if (typeof v === 'object') {
    if ('text' in v && typeof v.text === 'string') return v.text.trim();
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue, kind);
    if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
  }
  return String(v).trim();
}

/** Raw rows of the first sheet (or a CSV), header row skipped, empty rows dropped. */
export async function readSheet(data: Buffer, kind: 'xlsx' | 'csv'): Promise<{ row: number; cells: Record<(typeof IMPORT_COLUMNS)[number], string> }[]> {
  const out: { row: number; cells: Record<(typeof IMPORT_COLUMNS)[number], string> }[] = [];
  if (kind === 'csv') {
    const lines = data.toString('utf8').replace(/^﻿/, '').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (i === 0 || !line.trim()) return;
      const parts = splitCsv(line);
      out.push({ row: i + 1, cells: Object.fromEntries(IMPORT_COLUMNS.map((k, j) => [k, (parts[j] ?? '').trim()])) as never });
    });
    return out;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  ws?.eachRow((r, n) => {
    if (n === 1) return;
    const cells = Object.fromEntries(
      IMPORT_COLUMNS.map((k, j) => [k, cellText(r.getCell(j + 1).value, k === 'date' ? 'date' : k === 'start' || k === 'end' ? 'time' : 'text')]),
    ) as Record<(typeof IMPORT_COLUMNS)[number], string>;
    if (Object.values(cells).every((v) => !v)) return;
    out.push({ row: n, cells });
  });
  return out;
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') out.push(cur), (cur = '');
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Turns sheet rows into session inputs; anything unreadable becomes a row problem. */
export async function importRows(pool: pg.Pool, sheet: Awaited<ReturnType<typeof readSheet>>): Promise<BulkRow[]> {
  const [rooms, people] = [await listRooms(pool), await listPeople(pool)];
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const roomBy = new Map(rooms.map((r) => [norm(r.code), r]));
  const personBy = new Map(people.filter((p) => p.isActive).map((p) => [norm(p.nickname), p]));
  return sheet.map(({ row, cells }) => {
    const problems: string[] = [];
    // YYYY-MM-DD, or DD/MM/YYYY as Thai sheets often have it.
    const date = /^\d{4}-\d{2}-\d{2}$/.test(cells.date) ? cells.date : /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cells.date) ? dmy(cells.date) : null;
    if (!date) problems.push('bad_date');
    const room = roomBy.get(norm(cells.room));
    if (!room) problems.push('unknown_room');
    const t = (v: string) => (/^\d{1,2}[:.]\d{2}$/.test(v) ? v.replace('.', ':').padStart(5, '0') : null);
    const start = t(cells.start);
    const end = t(cells.end);
    if (!start || !end) problems.push('bad_time');
    const staff: SessionInput['staff'] = [];
    for (const role of ['mc', 'pd'] as const) {
      if (!cells[role]) continue;
      const p = personBy.get(norm(cells[role]));
      if (!p) problems.push(`unknown_${role}`);
      else staff.push({ personId: p.id, role });
    }
    if (problems.length || !date || !room || !start || !end) return { row, input: null, problems };
    // Same as the board: 00:00-05:59 is the night of the row's date; an end before the start is the next day.
    const at = (time: string) => {
      const d = new Date(`${date}T${time}:00+07:00`);
      return Number(time.slice(0, 2)) < LIVE_DAY_START_H ? new Date(d.getTime() + DAY_MS) : d;
    };
    const s = at(start);
    let e = at(end);
    if (e <= s) e = new Date(e.getTime() + DAY_MS);
    return { row, problems, input: { roomId: room.id, start: s, end: e, staff, note: cells.note || null } };
  });
}

function dmy(v: string): string {
  const [d, m, y] = v.split('/').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
