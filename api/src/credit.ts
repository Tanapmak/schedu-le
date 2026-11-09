import type pg from 'pg';
import { creditFor, type CancelReason, type Credit, type CreditLeave, type HoursCredit, type Session, type StaffAssignment } from './rules/index.js';
import { getSession, type Db } from './store.js';

/**
 * Loads what creditFor needs (leave, later sessions, clock-ins) for a set of sessions, once,
 * and returns a resolver. Published sessions need no lookups, so a month without cancellations
 * costs no extra queries.
 */
export type CreditResolver = (session: Session, st: StaffAssignment) => Credit;

const DAY_MS = 86_400_000;

export async function creditResolver(db: Db, sessions: Session[], now: Date): Promise<CreditResolver> {
  const cancelled = sessions.filter((s) => s.status === 'cancelled');
  if (cancelled.length === 0) return (s, st) => creditFor(s, st, { now, leaves: [], workedBetween: () => false });

  const first = Math.min(...cancelled.map((s) => s.start.getTime()));
  const last = Math.max(...cancelled.map((s) => s.start.getTime()));
  const people = [...new Set(cancelled.flatMap((s) => s.staff.map((st) => st.personId)))];

  // Leave a few weeks either side, so a run of sick days across a month end is seen whole.
  const { rows: leaveRows } = await db.query(
    `SELECT l.id::int, l.person_id::int, lower(l.period) AS start, upper(l.period) AS "end", l.kind, l.reason_code,
            EXISTS (SELECT 1 FROM leave_documents d WHERE d.leave_id = l.id) AS has_document
       FROM leave_requests l
      WHERE l.person_id = ANY($1) AND l.status IN ('pending', 'approved') AND l.period && tstzrange($2, $3)
      ORDER BY lower(l.period)`,
    [people, new Date(first - 45 * DAY_MS), new Date(last + 45 * DAY_MS)],
  );
  const leaves: CreditLeave[] = leaveRows.map((r) => ({
    id: r.id,
    personId: r.person_id,
    start: r.start,
    end: r.end,
    kind: r.kind,
    reasonCode: r.reason_code,
    hasDocument: r.has_document,
  }));

  // Work that counts as "came back": a session that went live with the person on it, or a clock-in.
  const { rows: workRows } = await db.query(
    `SELECT st.person_id::int AS person_id, lower(s.period) AS at, s.id::int AS session_id
       FROM session_staff st JOIN sessions s ON s.id = st.session_id
      WHERE st.person_id = ANY($1) AND NOT st.replaced AND s.status = 'published' AND lower(s.period) >= $2 AND lower(s.period) < $3
     UNION ALL
     SELECT a.person_id::int, a.clock_in_at, a.session_id::int
       FROM attendance a
      WHERE a.person_id = ANY($1) AND a.clock_in_at >= $2 AND a.clock_in_at < $3`,
    [people, new Date(first), new Date(last + 2 * DAY_MS)],
  );
  const work = new Map<number, { at: number; sessionId: number | null }[]>();
  for (const r of workRows) work.set(r.person_id, [...(work.get(r.person_id) ?? []), { at: new Date(r.at).getTime(), sessionId: r.session_id }]);

  const workedBetween = (personId: number, from: Date, to: Date, exceptSessionId?: number) =>
    (work.get(personId) ?? []).some((w) => w.at >= from.getTime() && w.at < to.getTime() && w.sessionId !== exceptSessionId);

  return (s, st) => creditFor(s, st, { now, leaves, workedBetween });
}

// ---------------------------------------------------------------- cancelling and overrides

export interface CreditChoice {
  personId: number;
  credit: HoursCredit;
  note: string | null;
}

export interface StaffCredit {
  personId: number;
  role: StaffAssignment['role'];
  replaced: boolean;
  hoursCredit: HoursCredit;
  creditNote: string | null;
  credit: Credit;
}

/**
 * How hours fall for each person on a session. For a session not cancelled yet, `asCancelled`
 * previews what cancelling it now would give (the cancel dialog shows this).
 */
export async function sessionCredits(db: Db, id: number, now: Date, asCancelled = false): Promise<StaffCredit[] | undefined> {
  const s = await getSession(db, id);
  if (!s) return undefined;
  const view = asCancelled && s.status === 'published' ? { ...s, status: 'cancelled' as const, countHoursWhenCancelled: true } : s;
  const credit = await creditResolver(db, [view], now);
  return view.staff.map((st) => ({
    personId: st.personId,
    role: st.role,
    replaced: Boolean(st.replaced),
    hoursCredit: st.hoursCredit ?? 'auto',
    creditNote: st.creditNote ?? null,
    credit: credit(view, st),
  }));
}

async function writeCredits(db: Db, sessionId: number, choices: CreditChoice[], actorId: number) {
  for (const c of choices) {
    const { rows } = await db.query(
      `SELECT hours_credit, credit_note FROM session_staff WHERE session_id = $1 AND person_id = $2`,
      [sessionId, c.personId],
    );
    if (!rows[0]) continue;
    const note = c.credit === 'auto' ? null : c.note;
    if (rows[0].hours_credit === c.credit && rows[0].credit_note === note) continue;
    await db.query(
      `UPDATE session_staff SET hours_credit = $3, credit_note = $4, credit_by = $5, credit_at = now()
        WHERE session_id = $1 AND person_id = $2`,
      [sessionId, c.personId, c.credit, note, actorId],
    );
    await db.query(
      `INSERT INTO audit_log (actor_id, action, entity, entity_id, before, after) VALUES ($1, 'hours_credit', 'sessions', $2, $3, $4)`,
      [
        actorId,
        sessionId,
        JSON.stringify({ personId: c.personId, credit: rows[0].hours_credit, note: rows[0].credit_note }),
        JSON.stringify({ personId: c.personId, credit: c.credit, note }),
      ],
    );
  }
}

export type CancelOutcome = { ok: true } | { ok: false; status: 404 | 422; error: string };

const validChoices = (choices: CreditChoice[]) => choices.every((c) => c.credit === 'auto' || (c.note && c.note.trim() !== ''));

export async function cancelSession(
  pool: pg.Pool,
  id: number,
  input: { reasonCode: CancelReason; reason: string | null; credits: CreditChoice[] },
  actorId: number,
): Promise<CancelOutcome> {
  if (input.reasonCode === 'other' && !input.reason) return { ok: false, status: 422, error: 'other_needs_text' };
  if (!validChoices(input.credits)) return { ok: false, status: 422, error: 'override_needs_note' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE sessions SET status = 'cancelled', cancel_reason = $2, cancel_reason_code = $3, count_hours_when_cancelled = true
        WHERE id = $1 AND status = 'published'`,
      [id, input.reason ?? input.reasonCode, input.reasonCode],
    );
    if (!rowCount) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'not_found' };
    }
    await writeCredits(client, id, input.credits, actorId);
    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Change who earns hours on a session already cancelled (including ones cancelled before this rule). */
export async function updateCredits(pool: pg.Pool, id: number, credits: CreditChoice[], actorId: number): Promise<CancelOutcome> {
  if (!validChoices(credits)) return { ok: false, status: 422, error: 'override_needs_note' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT status FROM sessions WHERE id = $1 FOR UPDATE`, [id]);
    if (rows[0]?.status !== 'cancelled') {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'not_found' };
    }
    await writeCredits(client, id, credits, actorId);
    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
