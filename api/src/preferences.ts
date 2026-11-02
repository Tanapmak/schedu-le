import type { Db } from './store.js';

/** Each person's own scheduling wishes, in their words. */
export interface Preference {
  personId: number;
  nickname: string;
  text: string;
  updatedAt: string;
}

export async function listPreferences(db: Db, personId?: number): Promise<Preference[]> {
  const { rows } = await db.query(
    `SELECT f.person_id::int, p.nickname, f.text, f.updated_at FROM preferences f JOIN people p ON p.id = f.person_id
      WHERE p.is_active AND ($1::bigint IS NULL OR f.person_id = $1) AND f.text <> '' ORDER BY p.nickname`,
    [personId ?? null],
  );
  return rows.map((r) => ({ personId: r.person_id, nickname: r.nickname, text: r.text, updatedAt: new Date(r.updated_at).toISOString() }));
}

export async function savePreference(db: Db, personId: number, text: string): Promise<void> {
  await db.query(
    `INSERT INTO preferences (person_id, text) VALUES ($1, $2)
     ON CONFLICT (person_id) DO UPDATE SET text = EXCLUDED.text, updated_at = now()`,
    [personId, text],
  );
}
