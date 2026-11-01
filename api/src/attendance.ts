import type pg from 'pg';
import type { Db } from './store.js';

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Studio {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export async function listStudios(db: Db): Promise<Studio[]> {
  const { rows } = await db.query(`SELECT id::int, name, lat, lng, radius_m FROM studios ORDER BY id`);
  return rows.map((r) => ({ id: r.id, name: r.name, lat: r.lat, lng: r.lng, radiusM: r.radius_m }));
}

export async function saveStudio(db: Db, s: Omit<Studio, 'id'> & { id?: number }): Promise<number> {
  if (s.id) {
    await db.query(`UPDATE studios SET name = $2, lat = $3, lng = $4, radius_m = $5 WHERE id = $1`, [s.id, s.name, s.lat, s.lng, s.radiusM]);
    return s.id;
  }
  const { rows } = await db.query(`INSERT INTO studios (name, lat, lng, radius_m) VALUES ($1, $2, $3, $4) RETURNING id::int`, [s.name, s.lat, s.lng, s.radiusM]);
  return rows[0].id;
}

async function windowMinutes(db: Db): Promise<number> {
  const { rows } = await db.query(`SELECT value FROM rules WHERE key = 'clock_in_window_minutes'`);
  return rows[0] ? Number(rows[0].value) : 30;
}

export interface MySession {
  id: number;
  roomId: number;
  start: string;
  end: string;
  role: 'mc' | 'pd';
  location: 'studio' | 'offsite' | 'home';
  offsite: { lat: number; lng: number } | null;
}

/** The person's published sessions overlapping [from, to), earliest first. */
async function mySessions(db: Db, personId: number, from: Date, to: Date): Promise<MySession[]> {
  const { rows } = await db.query(
    `SELECT s.id::int, s.room_id::int, lower(s.period) AS start, upper(s.period) AS "end", st.role,
            s.location::text AS location, s.offsite_lat, s.offsite_lng
       FROM sessions s JOIN session_staff st ON st.session_id = s.id
      WHERE st.person_id = $1 AND NOT st.replaced AND s.status = 'published' AND s.period && tstzrange($2, $3)
      ORDER BY lower(s.period)`,
    [personId, from, to],
  );
  return rows.map((r) => ({
    id: r.id,
    roomId: r.room_id,
    start: new Date(r.start).toISOString(),
    end: new Date(r.end).toISOString(),
    role: r.role,
    location: r.location,
    offsite: r.offsite_lat === null ? null : { lat: r.offsite_lat, lng: r.offsite_lng },
  }));
}

/** Where the person may clock in for a session: in area, how far from the nearest allowed place. */
export function checkArea(
  session: Pick<MySession, 'location' | 'offsite'>,
  studios: Studio[],
  at: { lat: number; lng: number } | null,
): { inArea: boolean; distanceM: number | null } {
  if (session.location === 'home') return { inArea: true, distanceM: null };
  // No studio set up yet: nothing to check against.
  const places =
    session.location === 'offsite' && session.offsite
      ? [{ ...session.offsite, radiusM: 300 }]
      : studios.map((s) => ({ lat: s.lat, lng: s.lng, radiusM: s.radiusM }));
  if (places.length === 0) return { inArea: true, distanceM: null };
  if (!at) return { inArea: false, distanceM: null };
  let best = { inArea: false, distanceM: Infinity };
  for (const p of places) {
    const d = distanceM(at, p);
    if (d < best.distanceM) best = { inArea: d <= p.radiusM, distanceM: d };
    if (d <= p.radiusM) best.inArea = true;
  }
  return { inArea: best.inArea, distanceM: Math.round(best.distanceM) };
}

export interface AttendanceRow {
  id: number;
  personId: number;
  sessionId: number | null;
  clockInAt: string;
  clockOutAt: string | null;
  inDistanceM: number | null;
  inArea: boolean;
  outDistanceM: number | null;
  offsiteReason: string | null;
  status: 'ok' | 'pending' | 'approved' | 'rejected';
  adjustedHours: number | null;
  adjustNote: string | null;
  /** Set when an approved time correction wrote these times. */
  correctionId: number | null;
}

const attendanceSelect = `SELECT id::int, person_id::int, session_id::int, clock_in_at, clock_out_at, in_distance_m, in_area,
  out_distance_m, offsite_reason, status, adjusted_hours, adjust_note, correction_id::int FROM attendance`;

const toRow = (r: any): AttendanceRow => ({
  id: r.id,
  personId: r.person_id,
  sessionId: r.session_id,
  clockInAt: new Date(r.clock_in_at).toISOString(),
  clockOutAt: r.clock_out_at ? new Date(r.clock_out_at).toISOString() : null,
  inDistanceM: r.in_distance_m,
  inArea: r.in_area,
  outDistanceM: r.out_distance_m,
  offsiteReason: r.offsite_reason,
  status: r.status,
  adjustedHours: r.adjusted_hours === null ? null : Number(r.adjusted_hours),
  adjustNote: r.adjust_note,
  correctionId: r.correction_id ?? null,
});

/** What the clock-in screen needs: the session to clock in for (now or next), today's records, the studios. */
export async function myAttendance(db: Db, personId: number, now: Date) {
  const window = await windowMinutes(db);
  const sessions = await mySessions(db, personId, new Date(now.getTime() - 12 * 3_600_000), new Date(now.getTime() + 14 * 86_400_000));
  const { rows } = await db.query(`${attendanceSelect} WHERE person_id = $1 AND clock_in_at > $2 ORDER BY clock_in_at`, [
    personId,
    new Date(now.getTime() - 24 * 3_600_000),
  ]);
  const records = rows.map(toRow);
  const open = records.find((r) => r.clockOutAt === null) ?? null;
  const done = new Set(records.map((r) => r.sessionId));
  // The open one's session, else the first not-yet-ended session not clocked in for yet.
  const session =
    (open && sessions.find((s) => s.id === open.sessionId)) ??
    sessions.find((s) => new Date(s.end) > now && !done.has(s.id)) ??
    null;
  const opensAt = session ? new Date(new Date(session.start).getTime() - window * 60_000).toISOString() : null;
  return { session, opensAt, windowMinutes: window, open, records, studios: await listStudios(db) };
}

export type ClockResult =
  | { ok: true; id: number; inArea: boolean; distanceM: number | null; status: AttendanceRow['status'] }
  | { ok: false; status: number; error: string; opensAt?: string };

export interface Fix {
  lat: number;
  lng: number;
}

export async function clockIn(pool: pg.Pool, personId: number, at: Fix | null, reason: string | null, now: Date): Promise<ClockResult> {
  const window = await windowMinutes(pool);
  const sessions = await mySessions(pool, personId, now, new Date(now.getTime() + window * 60_000));
  const { rows: openRows } = await pool.query(`SELECT 1 FROM attendance WHERE person_id = $1 AND clock_out_at IS NULL`, [personId]);
  if (openRows.length) return { ok: false, status: 409, error: 'already_clocked_in' };
  const { rows: doneRows } = await pool.query(`SELECT session_id::int FROM attendance WHERE person_id = $1 AND session_id = ANY($2)`, [
    personId,
    sessions.map((s) => s.id),
  ]);
  const done = new Set(doneRows.map((r) => r.session_id));
  const session = sessions.find((s) => !done.has(s.id) && new Date(s.start).getTime() - window * 60_000 <= now.getTime());
  if (!session) {
    const next = (await mySessions(pool, personId, now, new Date(now.getTime() + 14 * 86_400_000))).find((s) => !done.has(s.id));
    return {
      ok: false,
      status: 409,
      error: next ? 'too_early' : 'no_session',
      opensAt: next && new Date(new Date(next.start).getTime() - window * 60_000).toISOString(),
    };
  }
  const area = checkArea(session, await listStudios(pool), at);
  if (!area.inArea && !reason) return { ok: false, status: 422, error: 'out_of_area_needs_reason' };
  const status = area.inArea ? 'ok' : 'pending';
  const { rows } = await pool.query(
    `INSERT INTO attendance (person_id, session_id, clock_in_at, in_lat, in_lng, in_distance_m, in_area, offsite_reason, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id::int`,
    [personId, session.id, now, at?.lat ?? null, at?.lng ?? null, area.distanceM, area.inArea, area.inArea ? null : reason, status],
  );
  return { ok: true, id: rows[0].id, inArea: area.inArea, distanceM: area.distanceM, status };
}

export async function clockOut(db: Db, personId: number, at: Fix | null, now: Date): Promise<ClockResult> {
  const { rows } = await db.query(
    `SELECT a.id::int, a.session_id::int, a.status, s.location::text AS location, s.offsite_lat, s.offsite_lng
       FROM attendance a LEFT JOIN sessions s ON s.id = a.session_id
      WHERE a.person_id = $1 AND a.clock_out_at IS NULL`,
    [personId],
  );
  const open = rows[0];
  if (!open) return { ok: false, status: 409, error: 'not_clocked_in' };
  const area = checkArea(
    { location: open.location ?? 'studio', offsite: open.offsite_lat === null ? null : { lat: open.offsite_lat, lng: open.offsite_lng } },
    await listStudios(db),
    at,
  );
  await db.query(`UPDATE attendance SET clock_out_at = GREATEST($2, clock_in_at + interval '1 second'), out_lat = $3, out_lng = $4, out_distance_m = $5 WHERE id = $1`, [
    open.id,
    now,
    at?.lat ?? null,
    at?.lng ?? null,
    area.distanceM,
  ]);
  return { ok: true, id: open.id, inArea: area.inArea, distanceM: area.distanceM, status: open.status };
}

const FORGOT_OUT_MS = 60 * 60_000; // no clock-out an hour after the session ends: cut at the session end

/**
 * Hours that count for a record: the part of the clocked time inside the session.
 * The admin's adjustment wins; a rejected out-of-area clock-in counts nothing.
 */
export function countedHours(
  a: Pick<AttendanceRow, 'clockInAt' | 'clockOutAt' | 'status' | 'adjustedHours'>,
  session: { start: string; end: string } | null,
  now: Date,
): { hours: number; forgotOut: boolean } {
  if (a.adjustedHours !== null) return { hours: a.adjustedHours, forgotOut: false };
  if (a.status === 'rejected') return { hours: 0, forgotOut: false };
  const sessionEnd = session ? new Date(session.end).getTime() : null;
  const forgotOut = !a.clockOutAt && sessionEnd !== null && now.getTime() > sessionEnd + FORGOT_OUT_MS;
  let end = a.clockOutAt ? new Date(a.clockOutAt).getTime() : forgotOut ? sessionEnd! : now.getTime();
  let start = new Date(a.clockInAt).getTime();
  if (session) {
    start = Math.max(start, new Date(session.start).getTime());
    end = Math.min(end, sessionEnd!);
  }
  return { hours: Math.max(0, Math.round(((end - start) / 3_600_000) * 100) / 100), forgotOut };
}

/**
 * Admin view of one live day (06:00 to 06:00 the next morning, Bangkok), so a 22:00-02:00 session
 * sits on the day it started: every person in a published session, with their clock record.
 */
export async function dayAttendance(db: Db, date: string, now: Date) {
  const from = new Date(`${date}T06:00:00+07:00`);
  const to = new Date(from.getTime() + 86_400_000);
  const { rows: staff } = await db.query(
    `SELECT s.id::int AS session_id, s.room_id::int, lower(s.period) AS start, upper(s.period) AS "end", s.status::text,
            st.person_id::int, st.role
       FROM sessions s JOIN session_staff st ON st.session_id = s.id
      WHERE NOT st.replaced AND s.status IN ('published', 'cancelled') AND lower(s.period) >= $1 AND lower(s.period) < $2
      ORDER BY lower(s.period), s.room_id, st.role`,
    [from, to],
  );
  const { rows } = await db.query(
    `${attendanceSelect} WHERE session_id = ANY($1) OR (session_id IS NULL AND clock_in_at >= $2 AND clock_in_at < $3)`,
    [staff.map((s) => s.session_id), from, to],
  );
  const records = rows.map(toRow);
  const window = await windowMinutes(db);
  const out = staff.map((s) => {
    const session = { id: s.session_id, roomId: s.room_id, start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString(), status: s.status };
    const a = records.find((r) => r.sessionId === s.session_id && r.personId === s.person_id) ?? null;
    const lateMin = a ? Math.max(0, Math.floor((new Date(a.clockInAt).getTime() - new Date(session.start).getTime()) / 60_000)) : 0;
    const counted = a ? countedHours(a, session, now) : { hours: 0, forgotOut: false };
    let state: string;
    if (a) state = !a.clockOutAt ? (counted.forgotOut ? 'forgot_out' : 'working') : 'done';
    else if (session.status === 'cancelled') state = 'cancelled';
    else if (now.getTime() < new Date(session.start).getTime() - window * 60_000) state = 'not_yet';
    else if (now.getTime() < new Date(session.end).getTime()) state = 'not_in';
    else state = 'missed';
    return { personId: s.person_id, role: s.role, session, attendance: a, lateMin, countedHours: counted.hours, state };
  });
  return { rows: out, windowMinutes: window, studios: await listStudios(db) };
}

export async function decideAttendance(db: Db, id: number, decision: 'approve' | 'reject', adminId: number): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE attendance SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1 AND status IN ('pending', 'approved', 'rejected')`,
    [id, decision === 'approve' ? 'approved' : 'rejected', adminId],
  );
  return Boolean(rowCount);
}

export async function adjustAttendance(db: Db, id: number, hours: number | null, note: string | null, adminId: number): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE attendance SET adjusted_hours = $2, adjust_note = $3, decided_by = $4, decided_at = now() WHERE id = $1`,
    [id, hours, note, adminId],
  );
  return Boolean(rowCount);
}
