import type pg from 'pg';
import { BadRequest } from './input.js';
import { getSession, type Db } from './store.js';
import { isManager, type AppRole } from './auth.js';
import { bangkokMonth } from './rules/time.js';

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
  image: ResultImage | null;
}

export interface ResultImage { mediaType: string; base64: string; width: number | null; height: number | null; boxes: unknown[] }

const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

function parseImage(body: Record<string, unknown>): ResultImage | null {
  if (body.image === undefined || body.image === null || body.image === '') return null;
  const m = typeof body.image === 'string' ? IMAGE_DATA_URL.exec(body.image) : null;
  if (!m) throw new BadRequest('image must be a base64 data URL (png, jpeg, webp or gif)');
  const size = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 && (v as number) <= 10000 ? (v as number) : null);
  const boxes = Array.isArray(body.boxes) ? body.boxes.slice(0, 60) : [];
  return { mediaType: m[1], base64: m[2], width: size(body.width), height: size(body.height), boxes };
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
    image: parseImage(body),
  };
}

/** Admin, or anyone working the session, may record its results. */
export async function canRecord(db: Db, sessionId: number, user: { id: number; role: AppRole }) {
  const s = await getSession(db, sessionId);
  if (!s || s.status === 'draft') return { session: undefined, allowed: false };
  return { session: s, allowed: isManager(user.role) || s.staff.some((x) => x.personId === user.id) };
}

const SAME_BROADCAST_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

/** Fixed fine for a session whose result was never recorded by the cut-off. */
export const FORGOT_RECORD_DEDUCTION = 500;
/** PD/MC may edit a reading up to this many days after the session ended. */
export const EDIT_WINDOW_DAYS = 7;
/** Day of the following month on which a month's results close. */
export const CUTOFF_DAY = 25;

/**
 * Results of a session that starts in month M (Bangkok) can be recorded until the 25th of
 * month M+1, 00:00 Bangkok. Payroll for M+1 uses M's results, so this is when they close.
 */
export function recordCutoff(sessionStart: Date): Date {
  const [y, m] = bangkokMonth(sessionStart).split('-').map(Number);
  return new Date(Date.UTC(y, m, CUTOFF_DAY, -7)); // month index m (0-based) is the next month
}
export const editUntil = (sessionEnd: Date) => new Date(sessionEnd.getTime() + EDIT_WINDOW_DAYS * DAY_MS);

/** What the user may still do with a session's results. Admin and operation are never blocked. */
export function resultPolicy(session: { start: Date; end: Date }, role: AppRole, now: Date) {
  const cutoff = recordCutoff(session.start);
  const until = editUntil(session.end);
  const manager = isManager(role);
  return { cutoff, editUntil: until, canRecord: manager || now < cutoff, canEdit: manager || now <= until };
}

type Q = Pick<Db, 'query'>;

/** The published session in the same room that ends exactly when this one starts. */
async function previousSession(db: Q, session: { id?: number; roomId: number; start: Date }): Promise<number | null> {
  const { rows } = await db.query(
    `SELECT id::int FROM sessions
      WHERE room_id = $1 AND status = 'published' AND upper(period) = $2 AND id IS DISTINCT FROM $3
      LIMIT 1`,
    [session.roomId, session.start, session.id ?? null],
  );
  return rows[0]?.id ?? null;
}

interface Latest { id: number; broadcastId: number; liveStartedAt: Date | null }
async function latestReading(db: Q, sessionIds: number[], opts: { before?: Date; exclude?: number } = {}): Promise<Latest | null> {
  if (sessionIds.length === 0) return null;
  const { rows } = await db.query(
    `SELECT id::int, broadcast_id::int AS "broadcastId", live_started_at AS "liveStartedAt"
       FROM live_results
      WHERE session_id = ANY($1::bigint[]) AND superseded_at IS NULL AND id IS DISTINCT FROM $3
        AND ($2::timestamptz IS NULL OR captured_at <= $2)
      ORDER BY captured_at DESC, id DESC LIMIT 1`,
    [sessionIds, opts.before ?? null, opts.exclude ?? null],
  );
  return rows[0] ?? null;
}

export interface FlagInfo {
  isNewBroadcast: boolean;
  /** False when there is nothing to continue: no session right before this one, or it has no result yet. */
  canContinue: boolean;
  previousSessionId: number | null;
  previousHasResult: boolean;
}

/**
 * Suggests the Session Flag for a reading of `session`; the PD can still change it.
 * - The session already has readings: continues.
 * - No session in the same room ends exactly when this one starts (a gap, or the first of
 *   the day): new broadcast. "Continues" is not offered.
 * - That session has no result yet: new (nothing to subtract); the PD is told to record it first.
 * - The live start time was read off the screen and differs from the previous reading's: new.
 * - Otherwise: continues.
 */
export async function flagInfo(
  db: Q, session: { id?: number; roomId: number; start: Date }, liveStartedAt: Date | null, editingId?: number,
): Promise<FlagInfo> {
  // When editing, the reading being edited does not count: it is what is being decided.
  if (session.id !== undefined && (await latestReading(db, [session.id], { exclude: editingId }))) {
    return { isNewBroadcast: false, canContinue: true, previousSessionId: null, previousHasResult: false };
  }
  const prev = await previousSession(db, session);
  if (prev === null) return { isNewBroadcast: true, canContinue: false, previousSessionId: null, previousHasResult: false };
  const last = await latestReading(db, [prev], { exclude: editingId });
  if (!last) return { isNewBroadcast: true, canContinue: false, previousSessionId: prev, previousHasResult: false };
  const restarted = Boolean(liveStartedAt && last.liveStartedAt && Math.abs(last.liveStartedAt.getTime() - liveStartedAt.getTime()) > SAME_BROADCAST_MS);
  return { isNewBroadcast: restarted, canContinue: true, previousSessionId: prev, previousHasResult: true };
}

export async function suggestNewBroadcast(db: Q, session: { id?: number; roomId: number; start: Date }, liveStartedAt: Date | null) {
  return (await flagInfo(db, session, liveStartedAt)).isNewBroadcast;
}

/**
 * The broadcast a "continues" reading joins: the latest current reading of this session, or of
 * the session that ends right when it starts. Null (so it becomes a new broadcast) otherwise:
 * a reading never continues across a gap.
 */
async function continuedBroadcast(db: Q, session: { id: number; roomId: number; start: Date }, capturedAt: Date, exclude?: number) {
  const own = await latestReading(db, [session.id], { before: capturedAt, exclude });
  if (own) return own.broadcastId;
  const prev = await previousSession(db, session);
  if (prev === null) return null;
  return (await latestReading(db, [prev], { exclude }))?.broadcastId ?? null;
}

async function insertReading(
  db: Q, session: { id: number; roomId: number }, input: ResultInput, broadcastId: number | null, recordedBy: number,
  version: { replacesId: number; version: number } | null,
): Promise<number> {
  const id: number = (await db.query(`SELECT nextval('live_results_id_seq')::int AS id`)).rows[0].id;
  const cols = METRICS.map((m) => column[m]);
  const values = METRICS.map((m) => input.metrics[m] ?? null);
  await db.query(
    `INSERT INTO live_results (id, session_id, room_id, broadcast_id, is_new_broadcast, captured_at, live_started_at,
                               ${cols.join(', ')}, extra_metrics, source, ai_reading, note, recorded_by, replaces_id, version)
     VALUES ($12, $1, $2, $3, $4, $5, $6, ${cols.map((_, i) => `$${i + 15}`).join(', ')}, $7, $8, $9, $10, $11, $13, $14)`,
    [
      session.id, session.roomId, broadcastId ?? id, broadcastId === null, input.capturedAt, input.liveStartedAt,
      JSON.stringify(input.extraMetrics), input.source, input.aiReading === null ? null : JSON.stringify(input.aiReading),
      input.note, recordedBy, id, version?.replacesId ?? null, version?.version ?? 1, ...values,
    ],
  );
  if (input.image) {
    await db.query(
      `INSERT INTO live_result_images (result_id, media_type, width, height, data, boxes) VALUES ($1, $2, $3, $4, decode($5, 'base64'), $6)`,
      [id, input.image.mediaType, input.image.width, input.image.height, input.image.base64, JSON.stringify(input.image.boxes)],
    );
  }
  return id;
}

async function inRoomTx<T>(pool: pg.Pool, roomId: number, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialise readings per room so two PDs saving at once agree on the broadcast.
    await client.query('SELECT pg_advisory_xact_lock(4242, $1)', [roomId]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function saveResult(
  pool: pg.Pool, session: { id: number; roomId: number; start: Date }, input: ResultInput, recordedBy: number,
): Promise<number> {
  return inRoomTx(pool, session.roomId, async (c) => {
    const broadcastId = input.isNewBroadcast ? null : await continuedBroadcast(c, session, input.capturedAt);
    return insertReading(c, session, input, broadcastId, recordedBy, null);
  });
}

export type EditOutcome = { ok: true; id: number } | { ok: false; status: number; error: string };

/**
 * Saves an edit as a new version: the old reading is kept but superseded. If the flag changes,
 * the readings that came after it in its broadcast move along with the new version, so their
 * deltas stay right (e.g. fixing a wrong "continues" also fixes the next session's reading).
 */
export async function editResult(
  pool: pg.Pool, oldId: number, session: { id: number; roomId: number; start: Date }, input: ResultInput, recordedBy: number,
): Promise<EditOutcome> {
  return inRoomTx(pool, session.roomId, async (c) => {
    const { rows } = await c.query(
      `SELECT id::int, broadcast_id::int AS "broadcastId", captured_at AS "capturedAt", version, superseded_at AS "supersededAt",
              session_id::int AS "sessionId"
         FROM live_results WHERE id = $1 FOR UPDATE`,
      [oldId],
    );
    const old = rows[0];
    if (!old || old.sessionId !== session.id) return { ok: false, status: 404, error: 'not_found' };
    if (old.supersededAt) return { ok: false, status: 409, error: 'already_edited' };
    const broadcastId = input.isNewBroadcast ? null : await continuedBroadcast(c, session, input.capturedAt, oldId);
    const id = await insertReading(c, session, input, broadcastId, recordedBy, { replacesId: oldId, version: old.version + 1 });
    if (!input.image) {
      // Keep the screenshot the edit was made from.
      await c.query(
        `INSERT INTO live_result_images (result_id, media_type, width, height, data, boxes)
         SELECT $2, media_type, width, height, data, boxes FROM live_result_images WHERE result_id = $1`,
        [oldId, id],
      );
    }
    await c.query('UPDATE live_results SET superseded_at = now(), superseded_by = $2 WHERE id = $1', [oldId, id]);
    await c.query(
      `UPDATE live_results SET broadcast_id = $1, is_new_broadcast = false
        WHERE broadcast_id = $2 AND superseded_at IS NULL AND id <> $3
          AND (captured_at, id) > ($4::timestamptz, $5::bigint)`,
      [broadcastId ?? id, old.broadcastId, id, old.capturedAt, oldId],
    );
    return { ok: true, id };
  });
}

/** A reading with its session, for permission checks on edit/delete/image. */
export async function getResult(db: Q, id: number) {
  const { rows } = await db.query(
    `SELECT id::int, session_id::int AS "sessionId", recorded_by::int AS "recordedBy", superseded_at AS "supersededAt"
       FROM live_results WHERE id = $1`,
    [id],
  );
  return rows[0] as { id: number; sessionId: number | null; recordedBy: number | null; supersededAt: Date | null } | undefined;
}

export async function resultImage(db: Q, id: number) {
  const { rows } = await db.query(
    `SELECT media_type AS "mediaType", width, height, encode(data, 'base64') AS base64, boxes FROM live_result_images WHERE result_id = $1`,
    [id],
  );
  const r = rows[0];
  return r ? { url: `data:${r.mediaType};base64,${r.base64.replace(/\s/g, '')}`, width: r.width, height: r.height, boxes: r.boxes } : null;
}

/** Readings in [from, to), each with its delta from the previous reading of the same broadcast. */
export async function listResults(db: Db, from: Date, to: Date) {
  const { rows } = await db.query(
    `SELECT d.id::int, d.session_id::int AS "sessionId", d.room_id::int AS "roomId", d.broadcast_id::int AS "broadcastId",
            d.is_new_broadcast AS "isNewBroadcast", d.captured_at AS "capturedAt", d.live_started_at AS "liveStartedAt",
            d.duration_min AS "durationMin", d.gmv::float8, d.orders, d.items_sold AS "itemsSold", d.views,
            d.avg_view_sec::float8 AS "avgViewSec", d.product_clicks AS "productClicks", d.buyers, d.add_to_cart AS "addToCart",
            d.ads_cost::float8 AS "adsCost", d.extra_metrics AS "extraMetrics", d.source, d.note, d.ai_reading AS "aiReading",
            d.gmv_delta::float8 AS "gmvDelta", d.orders_delta::int AS "ordersDelta", d.views_delta::int AS "viewsDelta",
            d.version, d.created_at AS "createdAt", d.recorded_by::int AS "recordedById",
            EXISTS (SELECT 1 FROM live_result_images i WHERE i.result_id = d.id) AS "hasImage",
            p.nickname AS "recordedBy"
       FROM live_result_deltas d LEFT JOIN people p ON p.id = d.recorded_by
       LEFT JOIN sessions s ON s.id = d.session_id
      -- By the session's time, not when the reading was typed in: a PD often records a session
      -- after it ended (or the next day), and the reading must still show under that session.
      WHERE (s.id IS NOT NULL AND s.period && tstzrange($1, $2))
         OR (s.id IS NULL AND d.captured_at >= $1 AND d.captured_at < $2)
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

/**
 * Deletes a reading with all its earlier versions. A broadcast's first reading cannot go while
 * later readings continue it.
 */
export async function deleteResult(db: Db, id: number, user: { id: number; role: AppRole }): Promise<boolean> {
  const { rowCount } = await db.query(
    `WITH RECURSIVE target AS (
       SELECT r.* FROM live_results r
        WHERE r.id = $1 AND r.superseded_at IS NULL AND ($3 OR r.recorded_by = $2)
          AND NOT EXISTS (SELECT 1 FROM live_results n WHERE n.broadcast_id = r.broadcast_id AND n.id <> r.id
                             AND n.superseded_at IS NULL AND r.is_new_broadcast)
     ), chain AS (
       SELECT id, replaces_id FROM target
       UNION ALL
       SELECT r.id, r.replaces_id FROM live_results r JOIN chain c ON r.id = c.replaces_id
     )
     DELETE FROM live_results WHERE id IN (SELECT id FROM chain)`,
    [id, user.id, isManager(user.role)],
  );
  return Boolean(rowCount);
}
