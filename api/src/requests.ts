import type pg from 'pg';
import { checkLeave, hasErrors, loadRules, type Leave, type Violation } from './rules/index.js';
import { checkAgainstDb } from './sessions.js';
import { getSession, leavesBetween, listPeople, sessionsBetween, type Db } from './store.js';

/**
 * Leave and shift-swap requests. MC/PD file them for themselves (the admin may file for
 * anyone); only the admin decides. Errors always block; warnings need `confirm`, so the
 * person sees them first (same rule as saving a session).
 */

export type Outcome =
  | { ok: true; id: number; violations: Violation[] }
  | { ok: false; status: 403 | 404 | 409 | 422; violations: Violation[] };

const fail = (status: 403 | 404 | 409 | 422, code: string): Outcome => ({ ok: false, status, violations: [{ code, severity: 'error' }] });

/** Same check as filing; also used when the admin approves, since others may have filed since. */
async function leaveViolations(db: Db, leave: Leave): Promise<Violation[]> {
  if (leave.end <= leave.start) return [{ code: 'invalid_period', severity: 'error' }];
  const rules = await loadRules(db);
  const people = await listPeople(db);
  const leaves = await leavesBetween(db, leave.start, leave.end);
  const sessions = (await sessionsBetween(db, leave.start, leave.end)).filter((s) => s.status !== 'draft');
  return checkLeave(leave, { rules, people: new Map(people.map((p) => [p.id, p])), leaves, sessions });
}

export interface LeaveInput {
  personId: number;
  start: Date;
  end: Date;
  kind: 'normal' | 'urgent';
  reason: string | null;
}

export async function fileLeave(pool: pg.Pool, input: LeaveInput, opts: { confirm: boolean; actorId: number }): Promise<Outcome> {
  if (input.kind === 'urgent' && !input.reason) return fail(422, 'urgent_needs_reason');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // One filing at a time, so two people cannot both take the last quota place.
    await client.query('LOCK TABLE leave_requests IN SHARE ROW EXCLUSIVE MODE');
    const violations = await leaveViolations(client, { ...input, status: 'pending' });
    if (hasErrors(violations) || (violations.length > 0 && !opts.confirm)) {
      await client.query('ROLLBACK');
      return { ok: false, status: hasErrors(violations) ? 422 : 409, violations };
    }
    const { rows } = await client.query(
      `INSERT INTO leave_requests (person_id, period, kind, reason, created_by)
       VALUES ($1, tstzrange($2, $3), $4, $5, $6) RETURNING id::int`,
      [input.personId, input.start, input.end, input.kind, input.reason, opts.actorId],
    );
    await client.query('COMMIT');
    return { ok: true, id: rows[0].id, violations };
  } catch (err) {
    await client.query('ROLLBACK');
    if ((err as { constraint?: string }).constraint === 'leave_no_overlap') return fail(422, 'leave_overlap');
    throw err;
  } finally {
    client.release();
  }
}

export async function decideLeave(
  pool: pg.Pool,
  id: number,
  decision: 'approve' | 'reject',
  opts: { confirm: boolean; actorId: number },
): Promise<Outcome> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE leave_requests IN SHARE ROW EXCLUSIVE MODE');
    const { rows } = await client.query(
      `SELECT id::int, person_id::int, lower(period) AS start, upper(period) AS "end", kind, status FROM leave_requests WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return fail(404, 'not_found');
    }
    if (row.status !== 'pending') {
      await client.query('ROLLBACK');
      return fail(409, 'already_decided');
    }
    let violations: Violation[] = [];
    if (decision === 'approve') {
      violations = await leaveViolations(client, {
        id, personId: row.person_id, start: row.start, end: row.end, kind: row.kind, status: 'pending',
      });
      if (hasErrors(violations) || (violations.length > 0 && !opts.confirm)) {
        await client.query('ROLLBACK');
        return { ok: false, status: hasErrors(violations) ? 422 : 409, violations };
      }
    }
    await client.query(`UPDATE leave_requests SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1`, [
      id,
      decision === 'approve' ? 'approved' : 'rejected',
      opts.actorId,
    ]);
    await client.query('COMMIT');
    return { ok: true, id, violations };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** The person withdraws their own pending request; the admin may also take back an approved one. */
export async function withdrawLeave(db: Db, id: number, actor: { id: number; isAdmin: boolean }): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE leave_requests SET status = 'withdrawn', decided_by = $2, decided_at = now()
      WHERE id = $1 AND (status = 'pending' OR (status = 'approved' AND $3)) AND (person_id = $2 OR $3)`,
    [id, actor.id, actor.isAdmin],
  );
  return Boolean(rowCount);
}

export async function listLeave(db: Db, opts: { personId?: number; from?: Date; to?: Date; status?: string }) {
  const where: string[] = [];
  const args: unknown[] = [];
  const arg = (v: unknown) => `$${args.push(v)}`;
  if (opts.personId !== undefined) where.push(`l.person_id = ${arg(opts.personId)}`);
  if (opts.from && opts.to) where.push(`l.period && tstzrange(${arg(opts.from)}, ${arg(opts.to)})`);
  if (opts.status) where.push(`l.status = ${arg(opts.status)}`);
  const { rows } = await db.query(
    `SELECT l.id::int, l.person_id::int AS "personId", lower(l.period) AS start, upper(l.period) AS "end", l.kind, l.reason,
            l.status, l.created_at AS "createdAt", l.decided_at AS "decidedAt", d.nickname AS "decidedBy"
       FROM leave_requests l LEFT JOIN people d ON d.id = l.decided_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY lower(l.period) DESC LIMIT 200`,
    args,
  );
  return rows;
}

// ---------------------------------------------------------------- swaps

export interface SwapInput {
  requesterId: number;
  sessionId: number;
  targetId: number;
  targetSessionId: number | null;
  reason: string | null;
}

/** A swap can only touch published sessions that have not started yet. */
async function swapSessionsValid(db: Db, s: SwapInput): Promise<string | undefined> {
  const mine = await getSession(db, s.sessionId);
  if (!mine || mine.status !== 'published') return 'not_found';
  if (mine.start <= new Date()) return 'session_started';
  const myRow = mine.staff.find((x) => x.personId === s.requesterId && !x.replaced);
  if (!myRow) return 'not_your_session';
  if (mine.staff.some((x) => x.personId === s.targetId)) return 'target_already_in_session';
  if (s.targetSessionId !== null) {
    const theirs = await getSession(db, s.targetSessionId);
    if (!theirs || theirs.status !== 'published') return 'not_found';
    if (theirs.start <= new Date()) return 'session_started';
    if (!theirs.staff.some((x) => x.personId === s.targetId && !x.replaced)) return 'target_not_in_session';
    if (theirs.staff.some((x) => x.personId === s.requesterId)) return 'target_already_in_session';
  }
  return undefined;
}

export async function fileSwap(db: Db, input: SwapInput): Promise<Outcome> {
  if (input.requesterId === input.targetId) return fail(422, 'target_already_in_session');
  const problem = await swapSessionsValid(db, input);
  if (problem) return fail(problem === 'not_found' ? 404 : 422, problem);
  const { rows } = await db.query(
    `INSERT INTO swap_requests (requester_id, session_id, target_id, target_session_id, reason)
     VALUES ($1, $2, $3, $4, $5) RETURNING id::int`,
    [input.requesterId, input.sessionId, input.targetId, input.targetSessionId, input.reason],
  );
  return { ok: true, id: rows[0].id, violations: [] };
}

/**
 * Approving moves people between the sessions, then runs the normal session checks on
 * each changed session. Both staff rows are removed before either is re-added, so a
 * same-time swap does not trip the per-person overlap constraint half way.
 */
export async function decideSwap(
  pool: pg.Pool,
  id: number,
  decision: 'approve' | 'reject',
  opts: { confirm: boolean; actorId: number },
): Promise<Outcome> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id::int, requester_id::int AS "requesterId", session_id::int AS "sessionId", target_id::int AS "targetId",
              target_session_id::int AS "targetSessionId", reason, status
         FROM swap_requests WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const swap = rows[0];
    if (!swap) return await rollback(client, fail(404, 'not_found'));
    if (swap.status !== 'pending') return await rollback(client, fail(409, 'already_decided'));

    let violations: Violation[] = [];
    if (decision === 'approve') {
      await client.query('SELECT 1 FROM sessions WHERE id = ANY($1) FOR UPDATE', [[swap.sessionId, swap.targetSessionId].filter(Boolean)]);
      const problem = await swapSessionsValid(client, swap);
      if (problem) return await rollback(client, fail(422, problem));

      const roleIn = async (sessionId: number, personId: number) =>
        (await client.query(`SELECT role FROM session_staff WHERE session_id = $1 AND person_id = $2`, [sessionId, personId])).rows[0].role;
      const myRole = await roleIn(swap.sessionId, swap.requesterId);
      const theirRole = swap.targetSessionId ? await roleIn(swap.targetSessionId, swap.targetId) : null;

      await client.query(`DELETE FROM session_staff WHERE session_id = $1 AND person_id = $2`, [swap.sessionId, swap.requesterId]);
      if (swap.targetSessionId) {
        await client.query(`DELETE FROM session_staff WHERE session_id = $1 AND person_id = $2`, [swap.targetSessionId, swap.targetId]);
      }
      try {
        await client.query(`INSERT INTO session_staff (session_id, person_id, role) VALUES ($1, $2, $3)`, [swap.sessionId, swap.targetId, myRole]);
        if (swap.targetSessionId) {
          await client.query(`INSERT INTO session_staff (session_id, person_id, role) VALUES ($1, $2, $3)`, [
            swap.targetSessionId,
            swap.requesterId,
            theirRole,
          ]);
        }
      } catch (err) {
        if ((err as { constraint?: string }).constraint === 'session_staff_person_no_overlap') {
          return await rollback(client, fail(422, 'person_busy'));
        }
        throw err;
      }

      for (const sid of [swap.sessionId, swap.targetSessionId].filter(Boolean) as number[]) {
        const s = await getSession(client, sid);
        if (s) violations.push(...(await checkAgainstDb(client, s)));
      }
      if (hasErrors(violations) || (violations.length > 0 && !opts.confirm)) {
        return await rollback(client, { ok: false, status: hasErrors(violations) ? 422 : 409, violations });
      }
    }
    await client.query(`UPDATE swap_requests SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1`, [
      id,
      decision === 'approve' ? 'approved' : 'rejected',
      opts.actorId,
    ]);
    await client.query('COMMIT');
    return { ok: true, id, violations };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function rollback(client: pg.PoolClient, out: Outcome): Promise<Outcome> {
  await client.query('ROLLBACK');
  return out;
}

export async function withdrawSwap(db: Db, id: number, actor: { id: number; isAdmin: boolean }): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE swap_requests SET status = 'withdrawn', decided_at = now()
      WHERE id = $1 AND status = 'pending' AND (requester_id = $2 OR $3)`,
    [id, actor.id, actor.isAdmin],
  );
  return Boolean(rowCount);
}

export async function listSwaps(db: Db, opts: { personId?: number; status?: string }) {
  const where: string[] = [];
  const args: unknown[] = [];
  const arg = (v: unknown) => `$${args.push(v)}`;
  if (opts.personId !== undefined) {
    const p = arg(opts.personId);
    where.push(`(w.requester_id = ${p} OR w.target_id = ${p})`);
  }
  if (opts.status) where.push(`w.status = ${arg(opts.status)}`);
  const { rows } = await db.query(
    `SELECT w.id::int, w.requester_id::int AS "requesterId", w.target_id::int AS "targetId", w.reason, w.status,
            w.created_at AS "createdAt",
            json_build_object('id', s.id, 'roomId', s.room_id, 'start', lower(s.period), 'end', upper(s.period)) AS session,
            CASE WHEN t.id IS NULL THEN NULL
                 ELSE json_build_object('id', t.id, 'roomId', t.room_id, 'start', lower(t.period), 'end', upper(t.period)) END AS "targetSession"
       FROM swap_requests w
       JOIN sessions s ON s.id = w.session_id
       LEFT JOIN sessions t ON t.id = w.target_session_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY w.created_at DESC LIMIT 200`,
    args,
  );
  return rows.map((r) => ({
    ...r,
    session: { ...r.session, id: Number(r.session.id), roomId: Number(r.session.roomId) },
    targetSession: r.targetSession && { ...r.targetSession, id: Number(r.targetSession.id), roomId: Number(r.targetSession.roomId) },
  }));
}
