import type pg from 'pg';
import type { StaffRole } from './rules/index.js';
import type { Db } from './store.js';

/**
 * Who sells well where. Each past live's GMV per hour is compared with the average of the
 * same room in the same month (so campaign months don't flatter whoever worked them), then
 * averaged per person, role, room and time of day. Sources: the history sheet loaded once
 * (performance_history) and lives recorded in the app (live_results).
 */

export const LOOKBACK_MONTHS = 12;
export type Band = 'morning' | 'afternoon' | 'evening' | 'late';

/** 06-12 morning, 12-18 afternoon, 18-24 evening, 00-06 late (Bangkok). */
export function bandOf(d: Date): Band {
  const h = new Date(d.getTime() + 7 * 3_600_000).getUTCHours();
  return h < 6 ? 'late' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}

export interface Score {
  nickname: string;
  role: StaffRole;
  roomCode: string;
  band: Band | null; // null = the room overall
  ratio: number; // 1 = the room's average
  n: number;
}

export async function performanceScores(db: Db, now = new Date()): Promise<{ scores: Score[]; lives: number }> {
  const since = new Date(now.getTime() - LOOKBACK_MONTHS * 30 * 86_400_000);
  const { rows } = await db.query(
    `WITH app AS (
       SELECT s.id, r.code AS room_code, lower(s.period) AS started_at,
              extract(epoch FROM upper(s.period) - lower(s.period)) / 3600 AS hours,
              (SELECT sum(d.gmv_delta) FROM live_result_deltas d WHERE d.session_id = s.id) AS gmv
         FROM sessions s JOIN rooms r ON r.id = s.room_id
        WHERE s.status = 'published' AND lower(s.period) >= $1 AND lower(s.period) < $2
     ),
     lives AS (
       SELECT 'h' || h.id AS live, h.room_code, h.started_at, h.hours::float8 AS hours, h.gmv::float8 AS gmv, x.nickname, x.role
         FROM performance_history h
         CROSS JOIN LATERAL (SELECT unnest(h.mc) AS nickname, 'mc' AS role UNION ALL SELECT unnest(h.pd), 'pd') x
        WHERE h.started_at >= $1 AND h.gmv IS NOT NULL
       UNION ALL
       SELECT 'a' || a.id, a.room_code, a.started_at, a.hours::float8, a.gmv::float8, p.nickname, st.role::text
         FROM app a
         JOIN session_staff st ON st.session_id = a.id AND NOT st.replaced
         JOIN people p ON p.id = st.person_id
        WHERE a.gmv IS NOT NULL
     ),
     rated AS (
       SELECT *, (gmv / hours) / NULLIF(avg(gmv / hours) OVER (PARTITION BY room_code, date_trunc('month', started_at AT TIME ZONE 'Asia/Bangkok')), 0) AS ratio,
              CASE WHEN extract(hour FROM started_at AT TIME ZONE 'Asia/Bangkok') < 6 THEN 'late'
                   WHEN extract(hour FROM started_at AT TIME ZONE 'Asia/Bangkok') < 12 THEN 'morning'
                   WHEN extract(hour FROM started_at AT TIME ZONE 'Asia/Bangkok') < 18 THEN 'afternoon'
                   ELSE 'evening' END AS band
         FROM lives WHERE hours > 0 AND nickname <> ''
     )
     SELECT lower(nickname) AS nickname, role, room_code, band, avg(ratio)::float8 AS ratio, count(*)::int AS n, count(DISTINCT live)::int AS lives
       FROM rated WHERE ratio IS NOT NULL
      GROUP BY GROUPING SETS ((lower(nickname), role, room_code, band), (lower(nickname), role, room_code))`,
    [since, now],
  );
  const { rows: count } = await db.query(
    `SELECT (SELECT count(*) FROM performance_history WHERE started_at >= $1 AND gmv IS NOT NULL)
          + (SELECT count(DISTINCT session_id) FROM live_results WHERE session_id IS NOT NULL AND captured_at >= $1) AS n`,
    [since],
  );
  return {
    scores: rows.map((r) => ({ nickname: r.nickname, role: r.role, roomCode: r.room_code, band: r.band, ratio: r.ratio, n: r.n })),
    lives: Number(count[0].n),
  };
}

const SHRINK = 5; // lives needed before a score counts half

/** A person's expected ratio for a room and time of day, pulled towards 1 when there is little data. */
export function expected(scores: Map<string, Score>, nickname: string, role: StaffRole, roomCode: string, band: Band): number {
  const key = (b: Band | null) => `${nickname.toLowerCase()}|${role}|${roomCode}|${b ?? ''}`;
  const room = scores.get(key(null));
  const roomEst = room ? (room.n * room.ratio + SHRINK) / (room.n + SHRINK) : 1;
  const inBand = scores.get(key(band));
  return inBand ? (inBand.n * inBand.ratio + SHRINK * roomEst) / (inBand.n + SHRINK) : roomEst;
}

export const scoreMap = (scores: Score[]) => new Map(scores.map((s) => [`${s.nickname}|${s.role}|${s.roomCode}|${s.band ?? ''}`, s]));

// ---- Loading the history sheet (the cleaned CSV)

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(cur), (cur = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur || row.length) row.push(cur), rows.push(row);
  return rows.filter((r) => r.some((v) => v.trim()));
}

export class BadHistory extends Error {}

const ALIASES: Record<string, string> = { mc_1: 'mc_clean_1', mc_2: 'mc_clean_2', pd_1: 'pd_clean_1', pd_2: 'pd_clean_2', campaign_level: 'campaign_type' };
const NEEDED = ['account', 'date', 'start_time', 'duration_hours', 'mc_1', 'pd_1', 'session_gmv'] as const;

/** Replaces performance_history with the sheet's rows. Returns how many were loaded and skipped. */
export async function loadHistory(pool: pg.Pool, csv: string): Promise<{ loaded: number; skipped: number }> {
  const [header, ...data] = parseCsv(csv);
  if (!header) throw new BadHistory('empty file');
  const col: Record<string, number> = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  // The first cleaned sheet (v1) named some columns differently; accept both.
  for (const [name, old] of Object.entries(ALIASES)) if (col[name] === undefined && col[old] !== undefined) col[name] = col[old];
  const missing = NEEDED.filter((k) => col[k] === undefined);
  if (missing.length) throw new BadHistory(`missing columns: ${missing.join(', ')}`);
  const get = (r: string[], k: string) => (col[k] === undefined ? '' : (r[col[k]] ?? '').trim());
  const num = (v: string) => (v === '' || Number.isNaN(Number(v)) ? null : Number(v));

  // A negative session GMV is a dashboard reset or refund mix-up: keep the live, drop the number.
  const gmvOf = (v: number | null) => (v !== null && v >= 0 ? v : null);
  const rows: unknown[][] = [];
  let skipped = 0;
  for (const r of data) {
    const date = get(r, 'date');
    const time = get(r, 'start_time').slice(0, 5);
    const hours = num(get(r, 'duration_hours')) ?? num(get(r, 'scheduled_hours'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time) || !hours || hours <= 0 || !get(r, 'account')) {
      skipped++;
      continue;
    }
    const names = (...ks: string[]) => ks.map((k) => get(r, k)).filter(Boolean);
    rows.push([
      get(r, 'account'),
      `${date}T${time.padStart(5, '0')}:00+07:00`,
      hours,
      names('mc_1', 'mc_2'),
      names('pd_1', 'pd_2'),
      gmvOf(num(get(r, 'session_gmv'))),
      num(get(r, 'session_orders')),
      num(get(r, 'session_views')),
      get(r, 'campaign_level') || null,
    ]);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE performance_history');
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const values = chunk.map((_, j) => `(${Array.from({ length: 9 }, (_, k) => `$${j * 9 + k + 1}`).join(',')})`).join(',');
      await client.query(
        `INSERT INTO performance_history (room_code, started_at, hours, mc, pd, gmv, orders, views, campaign) VALUES ${values}`,
        chunk.flat(),
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { loaded: rows.length, skipped };
}
