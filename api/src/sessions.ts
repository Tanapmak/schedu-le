import type pg from 'pg';
import { bangkokMonth, checkSession, hasErrors, loadRules, type Session, type Violation } from './rules/index.js';
import {
  getSession,
  holidaysBetween,
  insertSession,
  leavesBetween,
  listPeople,
  listRooms,
  sessionsBetween,
  updateSession,
  type Db,
  type SessionInput,
} from './store.js';

/** Start and end (exclusive) of the Bangkok month a date falls in. */
export function monthRange(d: Date): { from: Date; to: Date } {
  const [y, m] = bangkokMonth(d).split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1, -7));
  const to = new Date(Date.UTC(y, m, 1, -7));
  return { from, to };
}

/** Runs the scheduling rules against what is in the database now. */
export async function checkAgainstDb(db: Db, session: Session): Promise<Violation[]> {
  // Sequential on purpose: one pg client runs one query at a time.
  const rules = await loadRules(db);
  const rooms = await listRooms(db);
  const people = await listPeople(db);
  const room = rooms.find((r) => r.id === session.roomId);
  if (!room) return [{ code: 'unknown_room', severity: 'error' }];
  // The whole month is needed for the hour cap; a session may also spill into the next month.
  const { from } = monthRange(session.start);
  const to = new Date(Math.max(monthRange(session.start).to.getTime(), session.end.getTime()));
  const sessions = await sessionsBetween(db, from, to);
  const leaves = await leavesBetween(db, session.start, session.end);
  const holidays = await holidaysBetween(db, session.start, session.end);
  return checkSession(session, {
    rules,
    room,
    people: new Map(people.map((p) => [p.id, p])),
    sessions,
    leaves,
    holidays,
  });
}

export type SaveResult =
  | { ok: true; id: number; violations: Violation[] }
  | { ok: false; status: 404 | 409 | 422; violations: Violation[] };

/**
 * Saves a new (id undefined) or edited session as a draft-or-current-status row.
 * Errors always block. Warnings block unless `confirm` is set, so the admin sees them first.
 * The database exclusion constraints are the final guard against two saves racing.
 */
export async function saveSession(
  pool: pg.Pool,
  input: SessionInput,
  opts: { id?: number; confirm?: boolean } = {},
): Promise<SaveResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let status: Session['status'] = 'draft';
    if (opts.id !== undefined) {
      const current = await getSession(client, opts.id);
      if (!current) {
        await client.query('ROLLBACK');
        return { ok: false, status: 404, violations: [{ code: 'not_found', severity: 'error' }] };
      }
      status = current.status;
    }
    const violations = await checkAgainstDb(client, { ...input, id: opts.id, status });
    if (hasErrors(violations) || (violations.length > 0 && !opts.confirm)) {
      await client.query('ROLLBACK');
      return { ok: false, status: hasErrors(violations) ? 422 : 409, violations };
    }
    const id = opts.id ?? (await insertSession(client, input));
    if (opts.id !== undefined) await updateSession(client, opts.id, input);
    await client.query('COMMIT');
    return { ok: true, id, violations };
  } catch (err) {
    await client.query('ROLLBACK');
    const clash = constraintViolation(err);
    if (clash) return { ok: false, status: 409, violations: [clash] };
    throw err;
  } finally {
    client.release();
  }
}

/** Maps a lost race (exclusion constraint) to the same codes the rules use. */
function constraintViolation(err: unknown): Violation | undefined {
  const constraint = (err as { constraint?: string }).constraint;
  if (constraint === 'sessions_room_no_overlap') return { code: 'room_busy', severity: 'error' };
  if (constraint === 'session_staff_person_no_overlap') return { code: 'person_busy', severity: 'error' };
  if (constraint === 'session_staff_session_id_person_id_key') return { code: 'duplicate_person', severity: 'error' };
  return undefined;
}

