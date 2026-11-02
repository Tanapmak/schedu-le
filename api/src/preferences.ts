import type { Db } from './store.js';

/**
 * Each person's own scheduling wishes, in their words. Every send is kept (the person sees
 * their history); planning a month uses each person's latest entry for that month.
 */
export interface PreferenceEntry {
  id: number;
  personId: number;
  nickname: string;
  month: string; // YYYY-MM the wishes are for
  text: string;
  createdAt: string;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonthKey = (v: unknown): v is string => typeof v === 'string' && MONTH.test(v);

const toEntry = (r: any): PreferenceEntry => ({
  id: r.id,
  personId: r.person_id,
  nickname: r.nickname,
  month: r.month,
  text: r.text,
  createdAt: new Date(r.created_at).toISOString(),
});

/** One person's whole history, newest first. */
export async function myPreferences(db: Db, personId: number): Promise<PreferenceEntry[]> {
  const { rows } = await db.query(
    `SELECT e.id::int, e.person_id::int, p.nickname, e.month, e.text, e.created_at
       FROM preference_entries e JOIN people p ON p.id = e.person_id
      WHERE e.person_id = $1 ORDER BY e.created_at DESC, e.id DESC LIMIT 200`,
    [personId],
  );
  return rows.map(toEntry);
}

/** Everyone's latest entry for each month in [from, to] (active people only). */
export async function latestPreferences(db: Db, from: string, to: string): Promise<PreferenceEntry[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (e.person_id, e.month) e.id::int, e.person_id::int, p.nickname, e.month, e.text, e.created_at
       FROM preference_entries e JOIN people p ON p.id = e.person_id
      WHERE p.is_active AND e.month BETWEEN $1 AND $2
      ORDER BY e.person_id, e.month, e.created_at DESC, e.id DESC`,
    [from, to],
  );
  return rows.map(toEntry).sort((a, b) => a.month.localeCompare(b.month) || a.nickname.localeCompare(b.nickname));
}

export async function addPreference(db: Db, personId: number, month: string, text: string): Promise<number> {
  const { rows } = await db.query(`INSERT INTO preference_entries (person_id, month, text) VALUES ($1, $2, $3) RETURNING id::int`, [personId, month, text]);
  return rows[0].id;
}
