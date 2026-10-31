import type pg from 'pg';
import { BadRequest } from './input.js';
import { getSession, type Db } from './store.js';

/** Core metrics shared by every platform; anything else goes in extraMetrics. */
export const METRICS = [
  'gmv', 'orders', 'itemsSold', 'views', 'avgViewSec', 'productClicks', 'buyers', 'addToCart', 'adsCost', 'durationMin',
] as const;
export type Metric = (typeof METRICS)[number];
const column: Record<Metric, string> = {
  gmv: 'gmv', orders: 'orders', itemsSold: 'items_sold', views: 'views', avgViewSec: 'avg_view_sec',
  productClicks: 'product_clicks', buyers: 'buyers', addToCart: 'add_to_cart', adsCost: 'ads_cost', durationMin: 'duration_min',
};
const integerMetric = new Set<Metric>(['orders', 'itemsSold', 'views', 'productClicks', 'buyers', 'addToCart', 'durationMin']);

export interface ResultInput {
  sessionId: number;
  capturedAt: Date;
  liveStartedAt: Date | null;
  isNewBroadcast: boolean;
  metrics: Partial<Record<Metric, number | null>>;
  extraMetrics: Record<string, string>;
  source: 'ai' | 'manual';
  aiReading: unknown;
  note: string | null;
}

export function parseResultInput(body: Record<string, unknown>): Omit<ResultInput, 'sessionId'> {
  const date = (v: unknown, field: string) => {
    if (v === undefined || v === null || v === '') return null;
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) throw new BadRequest(`${field} must be a date-time`);
    return d;
  };
  const raw = (body.metrics ?? {}) as Record<string, unknown>;
  const metrics: ResultInput['metrics'] = {};
  for (const m of METRICS) {
    const v = raw[m];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new BadRequest(`metrics.${m} must be a number ≥ 0`);
    metrics[m] = integerMetric.has(m) ? Math.round(n) : n;
  }
  const extra: Record<string, string> = {};
  if (body.extraMetrics && typeof body.extraMetrics === 'object') {
    for (const [k, v] of Object.entries(body.extraMetrics)) if (k.trim() && v != null) extra[k.trim().slice(0, 80)] = String(v).slice(0, 80);
  }
  if (typeof body.isNewBroadcast !== 'boolean') throw new BadRequest('isNewBroadcast must be true or false');
  return {
    capturedAt: date(body.capturedAt, 'capturedAt') ?? new Date(),
    liveStartedAt: date(body.liveStartedAt, 'liveStartedAt'),
    isNewBroadcast: body.isNewBroadcast,
    metrics,
    extraMetrics: extra,
    source: body.source === 'ai' ? 'ai' : 'manual',
    aiReading: body.aiReading ?? null,
    note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
  };
}

/** Admin, or anyone working the session, may record its results. */
export async function canRecord(db: Db, sessionId: number, user: { id: number; role: string }) {
  const s = await getSession(db, sessionId);
  if (!s || s.status === 'draft') return { session: undefined, allowed: false };
  return { session: s, allowed: user.role === 'admin' || s.staff.some((x) => x.personId === user.id) };
}

const SAME_BROADCAST_MS = 5 * 60_000;

/**
 * Suggests the Session Flag. It continues the room's latest broadcast when that broadcast
 * started at (about) the same time as this one; otherwise it is a new broadcast. Without a
 * start time, a reading within 3 hours of the room's last one is treated as continuing.
 */
export async function suggestNewBroadcast(db: Db, roomId: number, liveStartedAt: Date | null, capturedAt: Date): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT live_started_at, captured_at FROM live_results WHERE room_id = $1 ORDER BY captured_at DESC, id DESC LIMIT 1`,
    [roomId],
  );
  const last = rows[0];
  if (!last) return true;
  if (liveStartedAt && last.live_started_at) return Math.abs(last.live_started_at.getTime() - liveStartedAt.getTime()) > SAME_BROADCAST_MS;
  return Math.abs(capturedAt.getTime() - last.captured_at.getTime()) > 3 * 3_600_000;
}

export async function saveResult(pool: pg.Pool, roomId: number, input: ResultInput, recordedBy: number): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialise readings per room so two PDs saving at once agree on the broadcast.
    await client.query('SELECT pg_advisory_xact_lock(4242, $1)', [roomId]);
    let broadcastId: number | null = null;
    if (!input.isNewBroadcast) {
      const { rows } = await client.query(
        `SELECT broadcast_id::int FROM live_results WHERE room_id = $1 AND captured_at <= $2 ORDER BY captured_at DESC, id DESC LIMIT 1`,
        [roomId, input.capturedAt],
      );
      broadcastId = rows[0]?.broadcast_id ?? null; // nothing to continue: becomes a new broadcast
    }
    const id: number = (await client.query(`SELECT nextval('live_results_id_seq')::int AS id`)).rows[0].id;
    const cols = METRICS.map((m) => column[m]);
    const values = METRICS.map((m) => input.metrics[m] ?? null);
    const { rows } = await client.query(
      `INSERT INTO live_results (id, session_id, room_id, broadcast_id, is_new_broadcast, captured_at, live_started_at,
                                 ${cols.join(', ')}, extra_metrics, source, ai_reading, note, recorded_by)
       VALUES ($12, $1, $2, $3, $4, $5, $6, ${cols.map((_, i) => `$${i + 13}`).join(', ')}, $7, $8, $9, $10, $11)
       RETURNING id::int`,
      [
        input.sessionId, roomId, broadcastId ?? id, broadcastId === null, input.capturedAt, input.liveStartedAt,
        JSON.stringify(input.extraMetrics), input.source, input.aiReading === null ? null : JSON.stringify(input.aiReading),
        input.note, recordedBy, id, ...values,
      ],
    );
    await client.query('COMMIT');
    return rows[0].id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Readings in [from, to), each with its delta from the previous reading of the same broadcast. */
export async function listResults(db: Db, from: Date, to: Date) {
  const { rows } = await db.query(
    `SELECT d.id::int, d.session_id::int AS "sessionId", d.room_id::int AS "roomId", d.broadcast_id::int AS "broadcastId",
            d.is_new_broadcast AS "isNewBroadcast", d.captured_at AS "capturedAt", d.live_started_at AS "liveStartedAt",
            d.duration_min AS "durationMin", d.gmv::float8, d.orders, d.items_sold AS "itemsSold", d.views,
            d.avg_view_sec::float8 AS "avgViewSec", d.product_clicks AS "productClicks", d.buyers, d.add_to_cart AS "addToCart",
            d.ads_cost::float8 AS "adsCost", d.extra_metrics AS "extraMetrics", d.source, d.note,
            d.gmv_delta::float8 AS "gmvDelta", d.orders_delta::int AS "ordersDelta", d.views_delta::int AS "viewsDelta",
            p.nickname AS "recordedBy"
       FROM live_result_deltas d LEFT JOIN people p ON p.id = d.recorded_by
      WHERE d.captured_at >= $1 AND d.captured_at < $2
      ORDER BY d.captured_at DESC, d.id DESC`,
    [from, to],
  );
  return rows;
}

/** GMV (as shown, before refunds) and orders earned in each session: the sum of its readings' deltas. */
export async function resultsBySession(db: Db, from: Date, to: Date): Promise<Map<number, { gmv: number; orders: number }>> {
  const { rows } = await db.query(
    `SELECT d.session_id::int AS id, sum(d.gmv_delta)::float8 AS gmv, sum(d.orders_delta)::int AS orders
       FROM live_result_deltas d JOIN sessions s ON s.id = d.session_id
      WHERE s.period && tstzrange($1, $2)
      GROUP BY d.session_id`,
    [from, to],
  );
  return new Map(rows.map((r) => [r.id, { gmv: r.gmv ?? 0, orders: r.orders ?? 0 }]));
}

export async function deleteResult(db: Db, id: number, user: { id: number; role: string }): Promise<boolean> {
  const { rowCount } = await db.query(
    `DELETE FROM live_results WHERE id = $1 AND ($3 OR recorded_by = $2)
        AND NOT EXISTS (SELECT 1 FROM live_results n WHERE n.broadcast_id = live_results.broadcast_id AND n.id <> live_results.id AND live_results.is_new_broadcast)`,
    [id, user.id, user.role === 'admin'],
  );
  return Boolean(rowCount);
}
