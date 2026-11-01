import type pg from 'pg';
import type { AppRole } from './auth.js';
import { BadRequest } from './input.js';

type Db = Pick<pg.Pool, 'query'>;

const ROLES: AppRole[] = ['admin', 'operation', 'mc', 'pd', 'viewer'];
const POSITIONS = ['mc', 'pd', 'operation'] as const;
const EMPLOYMENTS = ['full_time', 'intern', 'freelance', 'guest'] as const;

export interface Member {
  id: number;
  nickname: string;
  fullName: string | null;
  email: string | null;
  position: (typeof POSITIONS)[number];
  employment: (typeof EMPLOYMENTS)[number];
  role: AppRole;
  isActive: boolean;
  startDate: string | null;
}

export type MemberInput = Omit<Member, 'id'>;

/** A taken nickname or email, reported to the form as a field error. */
export class Conflict extends Error {
  constructor(readonly field: 'nickname' | 'email') {
    super(`${field}_taken`);
  }
}

/** Saving would leave nobody able to manage the team. */
export class LastAdmin extends Error {}

const cols = `id::int, nickname, full_name, email, position, employment, app_role, is_active, start_date::text AS start_date`;

const toMember = (r: Record<string, unknown>): Member => ({
  id: r.id as number,
  nickname: r.nickname as string,
  fullName: (r.full_name as string | null) ?? null,
  email: (r.email as string | null) ?? null,
  position: r.position as Member['position'],
  employment: r.employment as Member['employment'],
  role: r.app_role as AppRole,
  isActive: r.is_active as boolean,
  startDate: (r.start_date as string | null) ?? null,
});

export async function listTeam(db: Db): Promise<Member[]> {
  const { rows } = await db.query(`SELECT ${cols} FROM people ORDER BY is_active DESC, nickname`);
  return rows.map(toMember);
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseMember(body: unknown): MemberInput {
  if (typeof body !== 'object' || body === null) throw new BadRequest('body must be an object');
  const b = body as Record<string, unknown>;
  const nickname = text(b.nickname);
  if (!nickname || nickname.length > 40) throw new BadRequest('nickname is required (up to 40 characters)');
  const email = text(b.email)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) throw new BadRequest('email is not valid');
  if (!POSITIONS.includes(b.position as never)) throw new BadRequest('bad position');
  if (!EMPLOYMENTS.includes(b.employment as never)) throw new BadRequest('bad employment');
  if (!ROLES.includes(b.role as never)) throw new BadRequest('bad role');
  const role = b.role as AppRole;
  // Everyone who signs in needs an email; a viewer without one is just a name on the schedule.
  if (role !== 'viewer' && !email) throw new BadRequest('email is required for this role');
  const startDate = text(b.startDate);
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new BadRequest('startDate must be YYYY-MM-DD');
  return {
    nickname,
    fullName: text(b.fullName),
    email,
    position: b.position as Member['position'],
    employment: b.employment as Member['employment'],
    role,
    isActive: b.isActive !== false,
    startDate,
  };
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    if (e.code === '23505') throw new Conflict(e.constraint === 'people_email_key' ? 'email' : 'nickname');
    throw err;
  }
}

async function audit(db: Db, actorId: number, action: string, id: number, before: Member | null, after: Member) {
  await db.query(`INSERT INTO audit_log (actor_id, action, entity, entity_id, before, after) VALUES ($1, $2, 'people', $3, $4, $5)`, [
    actorId,
    action,
    id,
    before && JSON.stringify(before),
    JSON.stringify(after),
  ]);
}

export async function addMember(db: Db, input: MemberInput, actorId: number): Promise<Member> {
  const { rows } = await run(() =>
    db.query(
      `INSERT INTO people (nickname, full_name, email, position, employment, app_role, is_active, start_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${cols}`,
      [input.nickname, input.fullName, input.email, input.position, input.employment, input.role, input.isActive, input.startDate],
    ),
  );
  const member = toMember(rows[0]);
  await audit(db, actorId, 'add_member', member.id, null, member);
  return member;
}

/** Undefined when the member doesn't exist. */
export async function updateMember(db: Db, id: number, input: MemberInput, actorId: number): Promise<Member | undefined> {
  const { rows: found } = await db.query(`SELECT ${cols} FROM people WHERE id = $1`, [id]);
  if (!found[0]) return undefined;
  const before = toMember(found[0]);
  const stillAdmin = input.role === 'admin' && input.isActive;
  if (before.role === 'admin' && before.isActive && !stillAdmin) {
    // Keep at least one active master admin, or nobody could add members again.
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM people WHERE app_role = 'admin' AND is_active AND id <> $1`, [id]);
    if (rows[0].n === 0) throw new LastAdmin();
  }
  const { rows } = await run(() =>
    db.query(
      `UPDATE people SET nickname = $2, full_name = $3, email = $4, position = $5, employment = $6, app_role = $7, is_active = $8, start_date = $9
        WHERE id = $1 RETURNING ${cols}`,
      [id, input.nickname, input.fullName, input.email, input.position, input.employment, input.role, input.isActive, input.startDate],
    ),
  );
  const member = toMember(rows[0]);
  await audit(db, actorId, 'update_member', id, before, member);
  return member;
}
