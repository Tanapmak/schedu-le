import type pg from 'pg';

type Db = Pick<pg.ClientBase, 'query'>;
import type { Rules } from './types.js';

/** Reads the `rules` table. Every key must exist; the reference seed provides them. */
export async function loadRules(client: Db): Promise<Rules> {
  const { rows } = await client.query<{ key: string; value: unknown }>('SELECT key, value FROM rules');
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const get = <T>(key: string): T => {
    if (!byKey.has(key)) throw new Error(`Missing rule "${key}" (run npm run seed)`);
    return byKey.get(key) as T;
  };
  return {
    kpiHours: get('kpi_hours'),
    maxHours: get('max_hours'),
    leaveQuotaPerDay: get('leave_quota_per_day'),
    sessionSlotMinutes: get<number>('session_slot_minutes'),
  };
}
