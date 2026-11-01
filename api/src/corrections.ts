import type pg from 'pg';
import { checkArea, listStudios, type Fix } from './attendance.js';
import type { Db } from './store.js';

/**
 * Time corrections: someone forgot to clock in or out. They ask for the right times from the
 * session's place (studio area, or the offsite spot), and an admin or operation approves.
 * Approving writes the times into the attendance record.
 */

const LOOKBACK_DAYS = 7; // how far back a forgotten clock can still be fixed
const EARLY_MIN = 60; // asked-for times may start this long before the session...
const LATE_MIN = 3 * 60; // ...and end this long after it

export interface Correction {
  id: number;
  personId: number;
  nickname: string;
  sessionId: number;
  roomId: number;
  sessionStart: string;
  sessionEnd: string;
  /** The record as it is now (null: never clocked in). */
  current: { clockInAt: string; clockOutAt: string | null } | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  reason: string;
  distanceM: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

const select = `
  SELECT c.id::int, c.person_id::int, p.nickname, c.session_id::int, s.room_id::int,
         lower(s.period) AS session_start, upper(s.period) AS session_end,
         a.clock_in_at AS cur_in, a.clock_out_at AS cur_out,
         c.clock_in_at, c.clock_out_at, c.reason, c.distance_m, c.status::text, d.nickname AS decided_by, c.decided_at, c.created_at
    FROM attendance_corrections c
    JOIN people p ON p.id = c.person_id
    JOIN sessions s ON s.id = c.session_id
    LEFT JOIN attendance a ON a.session_id = c.session_id AND a.person_id = c.person_id
    LEFT JOIN people d ON d.id = c.decided_by`;

const toCorrection = (r: any): Correction => ({
  id: r.id,
  personId: r.person_id,
  nickname: r.nickname,
  sessionId: r.session_id,
  roomId: r.room_id,
  sessionStart: iso(r.session_start)!,
  sessionEnd: iso(r.session_end)!,
  current: r.cur_in ? { clockInAt: iso(r.cur_in)!, clockOutAt: iso(r.cur_out) } : null,
  clockInAt: iso(r.clock_in_at),
  clockOutAt: iso(r.clock_out_at),
  reason: r.reason,
  distanceM: r.distance_m,
  status: r.status,
  decidedBy: r.decided_by,
  decidedAt: iso(r.decided_at),
  createdAt: iso(r.created_at)!,
});

/** Pending first, then the last 30 days. One person's own, or everyone's for a manager. */
export async function listCorrections(db: Db, personId: number | null): Promise<Correction[]> {
  const { rows } = await db.query(
    `${select}
      WHERE ($1::bigint IS NULL OR c.person_id = $1) AND (c.status = 'pending' OR c.created_at > now() - interval '30 days')
      ORDER BY c.status = 'pending' DESC, c.created_at DESC`,
    [personId],
  );
  return rows.map(toCorrection);
}

export interface CorrectableSession {
  id: number;
  roomId: number;
  start: string;
  end: string;
  location: 'studio' | 'offsite' | 'home';
  offsite: { lat: number; lng: number } | null;
  attendance: { clockInAt: string; clockOutAt: string | null } | null;
  pendingCorrectionId: number | null;
}

/** The person's sessions of the last few days that have started: the ones a correction can be for. */
export async function correctableSessions(db: Db, personId: number, now: Date): Promise<CorrectableSession[]> {
  const { rows } = await db.query(
    `SELECT s.id::int, s.room_id::int, lower(s.period) AS start, upper(s.period) AS "end", s.location::text AS location,
            s.offsite_lat, s.offsite_lng, a.clock_in_at, a.clock_out_at, c.id::int AS pending_id
       FROM sessions s
       JOIN session_staff st ON st.session_id = s.id AND st.person_id = $1 AND NOT st.replaced
       LEFT JOIN attendance a ON a.session_id = s.id AND a.person_id = $1
       LEFT JOIN attendance_corrections c ON c.session_id = s.id AND c.person_id = $1 AND c.status = 'pending'
      WHERE s.status = 'published' AND lower(s.period) <= $2 AND upper(s.period) > $3
      ORDER BY lower(s.period) DESC`,
    [personId, now, new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000)],
  );
  return rows.map((r) => ({
    id: r.id,
    roomId: r.room_id,
    start: iso(r.start)!,
    end: iso(r.end)!,
    location: r.location,
    offsite: r.offsite_lat === null ? null : { lat: r.offsite_lat, lng: r.offsite_lng },
    attendance: r.clock_in_at ? { clockInAt: iso(r.clock_in_at)!, clockOutAt: iso(r.clock_out_at) } : null,
    pendingCorrectionId: r.pending_id ?? null,
  }));
}

export interface CorrectionInput {
  sessionId: number;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  reason: string;
}

export type CorrectionResult = { ok: true; id: number; distanceM: number | null } | { ok: false; status: number; error: string };

export async function requestCorrection(db: Db, personId: number, input: CorrectionInput, at: Fix | null, now: Date): Promise<CorrectionResult> {
  const session = (await correctableSessions(db, personId, now)).find((s) => s.id === input.sessionId);
  if (!session) return { ok: false, status: 404, error: 'session_not_correctable' };
  if (session.pendingCorrectionId) return { ok: false, status: 409, error: 'already_pending' };

  // Only from the session's place, like clocking in: the person has to actually be at the studio.
  const area = checkArea(session, await listStudios(db), at);
  if (!area.inArea) return { ok: false, status: 422, error: at ? 'out_of_area' : 'location_needed' };

  const cur = session.attendance;
  if (!input.clockInAt && !input.clockOutAt) return { ok: false, status: 400, error: 'times_needed' };
  // Never clocked in: both times are needed, or the record would stay open.
  if (!cur && (!input.clockInAt || !input.clockOutAt)) return { ok: false, status: 400, error: 'both_times_needed' };

  const lo = new Date(session.start).getTime() - EARLY_MIN * 60_000;
  const hi = Math.min(new Date(session.end).getTime() + LATE_MIN * 60_000, now.getTime());
  for (const t of [input.clockInAt, input.clockOutAt]) {
    if (t && (t.getTime() < lo || t.getTime() > hi)) return { ok: false, status: 400, error: 'time_outside_session' };
  }
  const inAt = input.clockInAt ?? (cur ? new Date(cur.clockInAt) : null);
  const outAt = input.clockOutAt ?? (cur?.clockOutAt ? new Date(cur.clockOutAt) : null);
  if (inAt && outAt && outAt <= inAt) return { ok: false, status: 400, error: 'out_before_in' };

  try {
    const { rows } = await db.query(
      `INSERT INTO attendance_corrections (person_id, session_id, clock_in_at, clock_out_at, reason, lat, lng, distance_m)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id::int`,
      [personId, session.id, input.clockInAt, input.clockOutAt, input.reason, at?.lat ?? null, at?.lng ?? null, area.distanceM],
    );
    return { ok: true, id: rows[0].id, distanceM: area.distanceM };
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return { ok: false, status: 409, error: 'already_pending' };
    throw err;
  }
}

export async function withdrawCorrection(db: Db, id: number, personId: number): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE attendance_corrections SET status = 'withdrawn' WHERE id = $1 AND person_id = $2 AND status = 'pending'`,
    [id, personId],
  );
  return Boolean(rowCount);
}

/** Approve writes the times into the attendance record (or creates it); reject only closes the request. */
export async function decideCorrection(
  pool: pg.Pool,
  id: number,
  decision: 'approve' | 'reject',
  managerId: number,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM attendance_corrections WHERE id = $1 FOR UPDATE`, [id]);
    const c = rows[0];
    if (!c) return rollback(client, 404, 'not_found');
    if (c.status !== 'pending') return rollback(client, 409, 'already_decided');

    if (decision === 'approve') {
      const { rows: found } = await client.query(
        `SELECT id::int, clock_in_at, clock_out_at, status FROM attendance WHERE session_id = $1 AND person_id = $2 FOR UPDATE`,
        [c.session_id, c.person_id],
      );
      const a = found[0];
      if (a) {
        const inAt = c.clock_in_at ?? a.clock_in_at;
        const outAt = c.clock_out_at ?? a.clock_out_at;
        if (outAt && new Date(outAt) <= new Date(inAt)) return rollback(client, 409, 'out_before_in');
        // A manager looked at it, so an out-of-area clock-in waiting for a decision counts as approved.
        await client.query(
          `UPDATE attendance SET clock_in_at = $2, clock_out_at = $3, correction_id = $4,
                  status = CASE WHEN status = 'pending' THEN 'approved'::attendance_status ELSE status END
            WHERE id = $1`,
          [a.id, inAt, outAt, c.id],
        );
      } else {
        await client.query(
          `INSERT INTO attendance (person_id, session_id, clock_in_at, clock_out_at, in_lat, in_lng, in_distance_m, in_area, status, correction_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'ok', $8)`,
          [c.person_id, c.session_id, c.clock_in_at, c.clock_out_at, c.lat, c.lng, c.distance_m, c.id],
        );
      }
    }
    await client.query(`UPDATE attendance_corrections SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1`, [
      id,
      decision === 'approve' ? 'approved' : 'rejected',
      managerId,
    ]);
    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function rollback(client: pg.PoolClient, status: number, error: string) {
  await client.query('ROLLBACK');
  return { ok: false as const, status, error };
}
