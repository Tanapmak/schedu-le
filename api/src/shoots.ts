import type pg from 'pg';
import type { AppRole } from './auth.js';
import { BadRequest, parseDate, parseId } from './input.js';
import type { Violation } from './rules/index.js';
import type { Db } from './store.js';

/** Who plans content shoots: video operation, plus the people who run the live schedule. */
export const canPlanShoots = (role: AppRole | undefined) => role === 'video' || role === 'admin' || role === 'operation';

/** A shoot can be long (a full day out), but not more than this. */
const MAX_SHOOT_HOURS = 16;

export interface Shoot {
  id: number;
  title: string;
  start: string;
  end: string;
  location: string | null;
  note: string | null;
  personIds: number[];
  createdBy: string | null;
  updatedAt: string;
}

export interface ShootInput {
  title: string;
  start: Date;
  end: Date;
  location: string | null;
  note: string | null;
  personIds: number[];
}

const text = (v: unknown, max: number, field: string) => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new BadRequest(`${field} must be text`);
  const s = v.trim();
  if (s.length > max) throw new BadRequest(`${field}: at most ${max} characters`);
  return s || null;
};

export function parseShootInput(body: unknown): ShootInput {
  if (typeof body !== 'object' || body === null) throw new BadRequest('body must be an object');
  const b = body as Record<string, unknown>;
  const title = text(b.title, 120, 'title');
  if (!title) throw new BadRequest('title is required');
  if (!Array.isArray(b.personIds)) throw new BadRequest('personIds must be an array');
  const personIds = [...new Set(b.personIds.map((v, i) => parseId(v, `personIds[${i}]`)))];
  if (personIds.length > 20) throw new BadRequest('at most 20 people per shoot');
  return {
    title,
    start: parseDate(b.start, 'start'),
    end: parseDate(b.end, 'end'),
    location: text(b.location, 120, 'location'),
    note: text(b.note, 1000, 'note'),
    personIds,
  };
}

const shootSelect = `
  SELECT c.id::int, c.title, lower(c.period) AS start, upper(c.period) AS "end", c.location, c.note, c.updated_at,
         p.nickname AS created_by,
         COALESCE(array_agg(cp.person_id::int ORDER BY cp.person_id) FILTER (WHERE cp.person_id IS NOT NULL), '{}') AS person_ids
    FROM content_shoots c
    LEFT JOIN content_shoot_people cp ON cp.shoot_id = c.id
    LEFT JOIN people p ON p.id = c.created_by`;

const toShoot = (r: any): Shoot => ({
  id: r.id,
  title: r.title,
  start: new Date(r.start).toISOString(),
  end: new Date(r.end).toISOString(),
  location: r.location,
  note: r.note,
  personIds: r.person_ids,
  createdBy: r.created_by,
  updatedAt: new Date(r.updated_at).toISOString(),
});

/** Shoots that overlap [from, to), optionally only the ones a person is in. */
export async function shootsBetween(db: Db, from: Date, to: Date, personId?: number): Promise<Shoot[]> {
  const { rows } = await db.query(
    `${shootSelect}
      WHERE c.period && tstzrange($1, $2)
        AND ($3::bigint IS NULL OR EXISTS (SELECT 1 FROM content_shoot_people x WHERE x.shoot_id = c.id AND x.person_id = $3))
      GROUP BY c.id, p.nickname ORDER BY lower(c.period), c.id`,
    [from, to, personId ?? null],
  );
  return rows.map(toShoot);
}

export async function getShoot(db: Db, id: number): Promise<Shoot | undefined> {
  const { rows } = await db.query(`${shootSelect} WHERE c.id = $1 GROUP BY c.id, p.nickname`, [id]);
  return rows[0] && toShoot(rows[0]);
}

/**
 * The rules a shoot must pass before it goes on the board. Errors block, warnings need a confirm.
 * - Never over a published live of anyone in it (error); a draft live is a warning, it may still move.
 * - Never two shoots for one person at once (error).
 * - Approved leave blocks; pending leave and team off days are warnings.
 */
export async function checkShoot(db: Db, s: ShootInput, id?: number): Promise<Violation[]> {
  if (s.end <= s.start) return [{ code: 'invalid_period', severity: 'error' }];
  const out: Violation[] = [];
  if (s.end.getTime() - s.start.getTime() > MAX_SHOOT_HOURS * 3_600_000) {
    out.push({ code: 'shoot_too_long', severity: 'error', detail: { hours: MAX_SHOOT_HOURS } });
  }
  if (s.personIds.length === 0) out.push({ code: 'shoot_no_people', severity: 'error' });
  if (s.personIds.length === 0) return out;

  const people = await db.query(`SELECT id::int, is_active FROM people WHERE id = ANY($1::bigint[])`, [s.personIds]);
  const known = new Map(people.rows.map((r) => [r.id as number, r.is_active as boolean]));
  for (const pid of s.personIds) {
    if (!known.has(pid)) out.push({ code: 'unknown_person', severity: 'error', personId: pid });
    else if (!known.get(pid)) out.push({ code: 'person_inactive', severity: 'error', personId: pid });
  }

  const lives = await db.query(
    `SELECT st.person_id::int, s.id::int AS session_id, s.room_id::int, s.status, lower(s.period) AS start, upper(s.period) AS "end"
       FROM session_staff st JOIN sessions s ON s.id = st.session_id
      WHERE st.person_id = ANY($1::bigint[]) AND st.active AND s.status <> 'cancelled'
        AND st.period && tstzrange($2, $3)
      ORDER BY lower(s.period)`,
    [s.personIds, s.start, s.end],
  );
  for (const r of lives.rows) {
    out.push({
      code: r.status === 'published' ? 'shoot_live_clash' : 'shoot_draft_clash',
      severity: r.status === 'published' ? 'error' : 'warning',
      personId: r.person_id,
      sessionId: r.session_id,
      detail: { roomId: r.room_id, start: new Date(r.start).toISOString(), end: new Date(r.end).toISOString() },
    });
  }

  const shoots = await db.query(
    `SELECT cp.person_id::int, c.id::int, c.title, lower(c.period) AS start, upper(c.period) AS "end"
       FROM content_shoot_people cp JOIN content_shoots c ON c.id = cp.shoot_id
      WHERE cp.person_id = ANY($1::bigint[]) AND cp.period && tstzrange($2, $3) AND ($4::bigint IS NULL OR c.id <> $4)`,
    [s.personIds, s.start, s.end, id ?? null],
  );
  for (const r of shoots.rows) {
    out.push({
      code: 'shoot_overlap',
      severity: 'error',
      personId: r.person_id,
      detail: { title: r.title, start: new Date(r.start).toISOString(), end: new Date(r.end).toISOString() },
    });
  }

  const leaves = await db.query(
    `SELECT id::int, person_id::int, status FROM leave_requests
      WHERE person_id = ANY($1::bigint[]) AND status IN ('pending', 'approved') AND period && tstzrange($2, $3)`,
    [s.personIds, s.start, s.end],
  );
  for (const r of leaves.rows) {
    out.push({
      code: r.status === 'approved' ? 'shoot_on_leave' : 'shoot_leave_pending',
      severity: r.status === 'approved' ? 'error' : 'warning',
      personId: r.person_id,
      leaveId: r.id,
    });
  }

  const holidays = await db.query(`SELECT name FROM holidays WHERE period && tstzrange($1, $2)`, [s.start, s.end]);
  for (const h of holidays.rows) out.push({ code: 'shoot_holiday', severity: 'warning', detail: { name: h.name } });
  return out;
}

export type ShootSave = { ok: true; id: number; violations: Violation[] } | { ok: false; status: 404 | 409 | 422; violations: Violation[] };

/** Saves a new (id undefined) or moved/edited shoot after the checks. Warnings need `confirm`. */
export async function saveShoot(pool: pg.Pool, s: ShootInput, opts: { id?: number; confirm?: boolean; actorId: number }): Promise<ShootSave> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (opts.id !== undefined && !(await getShoot(client, opts.id))) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, violations: [{ code: 'not_found', severity: 'error' }] };
    }
    const violations = await checkShoot(client, s, opts.id);
    const errors = violations.some((v) => v.severity === 'error');
    if (errors || (violations.length > 0 && !opts.confirm)) {
      await client.query('ROLLBACK');
      return { ok: false, status: errors ? 422 : 409, violations };
    }
    let id = opts.id;
    if (id === undefined) {
      const { rows } = await client.query(
        `INSERT INTO content_shoots (title, period, location, note, created_by, updated_by)
         VALUES ($1, tstzrange($2, $3), $4, $5, $6, $6) RETURNING id::int`,
        [s.title, s.start, s.end, s.location, s.note, opts.actorId],
      );
      id = rows[0].id as number;
    } else {
      await client.query(
        `UPDATE content_shoots SET title = $2, period = tstzrange($3, $4), location = $5, note = $6, updated_by = $7 WHERE id = $1`,
        [id, s.title, s.start, s.end, s.location, s.note, opts.actorId],
      );
      await client.query('DELETE FROM content_shoot_people WHERE shoot_id = $1', [id]);
    }
    for (const pid of s.personIds) {
      await client.query('INSERT INTO content_shoot_people (shoot_id, person_id) VALUES ($1, $2)', [id, pid]);
    }
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity, entity_id, after) VALUES ($1, $2, 'content_shoot', $3, $4)`,
      [opts.actorId, opts.id === undefined ? 'create' : 'update', id, JSON.stringify({ ...s })],
    );
    await client.query('COMMIT');
    return { ok: true, id, violations };
  } catch (err) {
    await client.query('ROLLBACK');
    // Lost a race with another save for the same person.
    if ((err as { constraint?: string }).constraint === 'content_shoot_person_no_overlap') {
      return { ok: false, status: 422, violations: [{ code: 'shoot_overlap', severity: 'error' }] };
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteShoot(db: Db, id: number, actorId: number): Promise<boolean> {
  const before = await getShoot(db, id);
  if (!before) return false;
  await db.query('DELETE FROM content_shoots WHERE id = $1', [id]);
  await db.query(`INSERT INTO audit_log (actor_id, action, entity, entity_id, before) VALUES ($1, 'delete', 'content_shoot', $2, $3)`, [
    actorId,
    id,
    JSON.stringify(before),
  ]);
  return true;
}

/**
 * The other direction: a live being scheduled over someone's content shoot. A warning, so the
 * live schedule can still win, but whoever saves it sees the shoot that will need moving.
 */
export async function shootClashesForLive(db: Db, staffIds: number[], start: Date, end: Date): Promise<Violation[]> {
  if (staffIds.length === 0 || end <= start) return [];
  const { rows } = await db.query(
    `SELECT cp.person_id::int, c.title, lower(c.period) AS start, upper(c.period) AS "end"
       FROM content_shoot_people cp JOIN content_shoots c ON c.id = cp.shoot_id
      WHERE cp.person_id = ANY($1::bigint[]) AND cp.period && tstzrange($2, $3)`,
    [staffIds, start, end],
  );
  return rows.map((r) => ({
    code: 'live_shoot_clash',
    severity: 'warning' as const,
    personId: r.person_id,
    detail: { title: r.title, start: new Date(r.start).toISOString(), end: new Date(r.end).toISOString() },
  }));
}
