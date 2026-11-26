import type { Db } from './store.js';

/**
 * Live performance per person and per room, from everything the system holds: the imported
 * history sheet (performance_history) and lives recorded in the app (live_results).
 * "Accumulated" counts every live that started before `to`; "this period" only [from, to).
 * The record is the person's (or room's) best single live by GMV.
 */

export interface Best {
  gmv: number;
  start: Date;
  room: string;
  hours: number;
}

export interface PerfRow {
  key: string;
  name: string;
  role?: 'mc' | 'pd';
  periodLives: number;
  periodHours: number;
  periodGmv: number;
  lives: number;
  hours: number;
  gmv: number;
  first: Date;
  best: Best;
}

interface Live {
  id: string;
  room: string;
  start: Date;
  hours: number;
  gmv: number;
  mc: string[];
  pd: string[];
}

export async function performanceReport(db: Db, from: Date, to: Date) {
  const { rows } = await db.query(
    `SELECT 'h' || h.id AS id, h.room_code AS room, h.started_at AS start, h.hours::float8 AS hours, h.gmv::float8 AS gmv,
            h.mc, h.pd
       FROM performance_history h
      WHERE h.started_at < $1 AND h.gmv IS NOT NULL
     UNION ALL
     SELECT 'a' || s.id, r.code, lower(s.period), extract(epoch FROM upper(s.period) - lower(s.period))::float8 / 3600, g.gmv,
            coalesce(array_agg(p.nickname ORDER BY p.nickname) FILTER (WHERE st.role = 'mc'), '{}'),
            coalesce(array_agg(p.nickname ORDER BY p.nickname) FILTER (WHERE st.role = 'pd'), '{}')
       FROM sessions s
       JOIN rooms r ON r.id = s.room_id
       JOIN LATERAL (SELECT sum(d.gmv_delta)::float8 AS gmv FROM live_result_deltas d WHERE d.session_id = s.id) g ON g.gmv IS NOT NULL
       LEFT JOIN session_staff st ON st.session_id = s.id AND NOT st.replaced
       LEFT JOIN people p ON p.id = st.person_id
      WHERE s.status = 'published' AND lower(s.period) < $1
      GROUP BY s.id, r.code, g.gmv`,
    [to],
  );
  const lives: Live[] = rows.map((r) => ({ ...r, start: new Date(r.start), mc: r.mc ?? [], pd: r.pd ?? [] }));

  // History names are as typed; match them to the team by nickname, ignoring case and spaces.
  const { rows: team } = await db.query(`SELECT nickname FROM people`);
  const norm = (n: string) => n.trim().toLowerCase();
  const display = new Map<string, string>(team.map((p) => [norm(p.nickname), p.nickname]));

  const add = (map: Map<string, PerfRow>, key: string, name: string, l: Live, role?: 'mc' | 'pd') => {
    let row = map.get(key);
    if (!row) {
      row = { key, name, role, periodLives: 0, periodHours: 0, periodGmv: 0, lives: 0, hours: 0, gmv: 0, first: l.start, best: { gmv: -1, start: l.start, room: l.room, hours: l.hours } };
      map.set(key, row);
    }
    row.lives += 1;
    row.hours += l.hours;
    row.gmv += l.gmv;
    if (l.start < row.first) row.first = l.start;
    if (l.gmv > row.best.gmv) row.best = { gmv: l.gmv, start: l.start, room: l.room, hours: l.hours };
    if (l.start >= from) {
      row.periodLives += 1;
      row.periodHours += l.hours;
      row.periodGmv += l.gmv;
    }
  };

  const people = new Map<string, PerfRow>();
  const rooms = new Map<string, PerfRow>();
  for (const l of lives) {
    add(rooms, l.room, l.room, l);
    for (const role of ['mc', 'pd'] as const) {
      for (const raw of new Set(l[role].map((n) => n.trim()).filter(Boolean))) {
        const key = norm(raw);
        add(people, `${key}|${role}`, display.get(key) ?? raw, l, role);
      }
    }
  }
  const byGmv = (a: PerfRow, b: PerfRow) => b.gmv - a.gmv;
  return {
    people: [...people.values()].sort((a, b) => (a.role === b.role ? byGmv(a, b) : a.role === 'mc' ? -1 : 1)),
    rooms: [...rooms.values()].sort(byGmv),
    inTeam: (name: string) => display.has(norm(name)),
  };
}
