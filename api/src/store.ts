import type pg from 'pg';
import type { Holiday, Leave, Person, Room, Session, StaffAssignment, StaffRole } from './rules/index.js';

/** A pool or a checked-out client: anything that can run a query. */
export type Db = Pick<pg.ClientBase, 'query'>;

// Row mappers. bigint ids arrive as strings from pg; the app never gets near 2^53.

export interface RoomRow extends Room {
  name: string;
  platform: 'tiktok' | 'shopee' | 'lazada';
}

export async function listRooms(db: Db): Promise<RoomRow[]> {
  const { rows } = await db.query(
    `SELECT id::int, code, name, platform, room_type, requires_pd, is_active FROM rooms ORDER BY array_position(ARRAY['tiktok', 'shopee', 'lazada'], platform), code`,
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    platform: r.platform,
    roomType: r.room_type,
    requiresPd: r.requires_pd,
    isActive: r.is_active,
  }));
}

export type Employment = 'full_time' | 'intern' | 'freelance' | 'guest';

export interface PersonRow extends Person {
  employment: Employment;
  kpiHours: number | null;
}

export async function listPeople(db: Db): Promise<PersonRow[]> {
  const { rows } = await db.query(
    `SELECT id::int, nickname, position, employment, is_active, max_hours::float8 AS max_hours, kpi_hours::float8 AS kpi_hours
       FROM people ORDER BY nickname`,
  );
  return rows.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    position: r.position,
    employment: r.employment,
    isActive: r.is_active,
    maxHours: r.max_hours,
    kpiHours: r.kpi_hours,
  }));
}

/** Where an off-site session happens; clock in/out checks this place instead of the studio. */
export interface OffsitePlace {
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface SessionRow extends Session {
  id: number;
  location: string;
  offsite: OffsitePlace | null;
  note: string | null;
  cancelReason: string | null;
  cancelReasonCode: string | null;
  staff: (StaffAssignment & { creditNote?: string | null })[];
}

const sessionSelect = `
  SELECT s.id::int, s.room_id::int, lower(s.period) AS start, upper(s.period) AS "end", s.status,
         s.location, s.offsite_name, s.offsite_lat, s.offsite_lng, s.offsite_radius_m, s.note, s.cancel_reason, s.cancel_reason_code, s.count_hours_when_cancelled,
         COALESCE(json_agg(json_build_object('personId', st.person_id, 'role', st.role, 'replaced', st.replaced,
                                           'hoursCredit', st.hours_credit, 'creditNote', st.credit_note)
                  ORDER BY st.role, st.id) FILTER (WHERE st.id IS NOT NULL), '[]') AS staff
    FROM sessions s
    LEFT JOIN session_staff st ON st.session_id = s.id`;

const toSession = (r: any): SessionRow => ({
  id: r.id,
  roomId: r.room_id,
  start: r.start,
  end: r.end,
  status: r.status,
  location: r.location,
  offsite:
    r.location === 'offsite' && r.offsite_lat !== null
      ? { name: r.offsite_name ?? '', lat: r.offsite_lat, lng: r.offsite_lng, radiusM: r.offsite_radius_m }
      : null,
  note: r.note,
  cancelReason: r.cancel_reason,
  cancelReasonCode: r.cancel_reason_code,
  countHoursWhenCancelled: r.count_hours_when_cancelled,
  staff: r.staff.map((s: { personId: string | number; role: StaffRole; replaced: boolean; hoursCredit: 'auto' | 'yes' | 'no'; creditNote: string | null }) => ({
    ...s,
    personId: Number(s.personId),
  })),
});

/** Sessions that overlap [from, to). */
export async function sessionsBetween(db: Db, from: Date, to: Date): Promise<SessionRow[]> {
  const { rows } = await db.query(
    `${sessionSelect} WHERE s.period && tstzrange($1, $2) GROUP BY s.id ORDER BY lower(s.period), s.room_id`,
    [from, to],
  );
  return rows.map(toSession);
}

export async function getSession(db: Db, id: number): Promise<SessionRow | undefined> {
  const { rows } = await db.query(`${sessionSelect} WHERE s.id = $1 GROUP BY s.id`, [id]);
  return rows[0] && toSession(rows[0]);
}

export async function leavesBetween(db: Db, from: Date, to: Date): Promise<Leave[]> {
  const { rows } = await db.query(
    `SELECT id::int, person_id::int, lower(period) AS start, upper(period) AS "end", status, kind, reason_code
       FROM leave_requests WHERE period && tstzrange($1, $2) AND status IN ('pending', 'approved')`,
    [from, to],
  );
  return rows.map((r) => ({ id: r.id, personId: r.person_id, start: r.start, end: r.end, status: r.status, kind: r.kind, reasonCode: r.reason_code }));
}

export async function holidaysBetween(db: Db, from: Date, to: Date): Promise<(Holiday & { id: number })[]> {
  const { rows } = await db.query(
    `SELECT id::int, name, lower(period) AS start, upper(period) AS "end" FROM holidays
      WHERE period && tstzrange($1, $2) ORDER BY lower(period)`,
    [from, to],
  );
  return rows;
}

export interface SessionInput {
  roomId: number;
  start: Date;
  end: Date;
  /** Left out: a new session is at the studio, an edited one keeps its place. */
  location?: 'studio' | 'offsite' | 'home';
  /** Needed when location is 'offsite'. */
  offsite?: OffsitePlace | null;
  note?: string | null;
  staff: StaffAssignment[];
}

/** Values for offsite_name, offsite_lat, offsite_lng, offsite_radius_m. */
function placeValues(s: SessionInput) {
  const o = s.location === 'offsite' ? s.offsite : null;
  return [o?.name ?? null, o?.lat ?? null, o?.lng ?? null, o?.radiusM ?? 300];
}

export async function insertSession(db: Db, s: SessionInput, createdBy?: number): Promise<number> {
  const { rows } = await db.query(
    `INSERT INTO sessions (room_id, period, location, note, created_by, offsite_name, offsite_lat, offsite_lng, offsite_radius_m)
     VALUES ($1, tstzrange($2, $3), $4, $5, $6, $7, $8, $9, $10) RETURNING id::int`,
    [s.roomId, s.start, s.end, s.location ?? 'studio', s.note ?? null, createdBy ?? null, ...placeValues(s)],
  );
  const id: number = rows[0].id;
  await replaceStaff(db, id, s.staff);
  return id;
}

export async function updateSession(db: Db, id: number, s: SessionInput): Promise<void> {
  await db.query(`UPDATE sessions SET room_id = $2, period = tstzrange($3, $4), note = $5 WHERE id = $1`, [
    id,
    s.roomId,
    s.start,
    s.end,
    s.note ?? null,
  ]);
  // Moving a session on the board sends no place: it stays where it was.
  if (s.location !== undefined) {
    await db.query(
      `UPDATE sessions SET location = $2, offsite_name = $3, offsite_lat = $4, offsite_lng = $5, offsite_radius_m = $6 WHERE id = $1`,
      [id, s.location, ...placeValues(s)],
    );
  }
  await replaceStaff(db, id, s.staff);
}

async function replaceStaff(db: Db, sessionId: number, staff: StaffAssignment[]) {
  await db.query('DELETE FROM session_staff WHERE session_id = $1', [sessionId]);
  for (const st of staff) {
    await db.query('INSERT INTO session_staff (session_id, person_id, role, replaced) VALUES ($1, $2, $3, $4)', [
      sessionId,
      st.personId,
      st.role,
      st.replaced ?? false,
    ]);
  }
}
