import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { createApp } from '../src/app.js';
import type { ScreenshotReader } from '../src/vision.js';
import { migrationsDir, seedDir } from '../src/paths.js';
import { migrate, runSqlDir } from '../src/sqlFiles.js';

// Needs a throwaway Postgres: this test drops and recreates the public schema.
const url = process.env.TEST_DATABASE_URL;

// Stands in for the Claude API: returns what a TikTok dashboard screenshot would read as.
const fakeReader: ScreenshotReader = async () => ({
  platform: 'tiktok', account_name: 'TCL', live_started_at: '2030-03-01 10:02', duration_min: 58,
  gmv: 12500, orders: 9, items_sold: 11, views: 4300, avg_view_sec: 41, product_clicks: 320, buyers: 8,
  add_to_cart: 25, ads_cost: null, extra: [{ label: 'GPM', value: '2.9K' }], unsure: [],
  boxes: [
    { field: 'gmv', x: 100, y: 50, w: 200, h: 40 },
    { field: 'extra:GPM', x: 350, y: 380, w: 100, h: 40 }, // runs past the bottom: clamped
    { field: 'orders', x: 900, y: 10, w: 50, h: 20 }, // off the image: dropped
  ],
});

describe.skipIf(!url)('leave, swaps and off days', () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  let rooms: Record<string, number>;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 5 });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const client = await pool.connect();
    await migrate(client, migrationsDir);
    client.release();
    server = createApp(pool, { mode: 'dev' }, { readScreenshot: fakeReader }).listen(0);
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE live_results, swap_requests, session_staff, sessions, leave_requests, holidays, people RESTART IDENTITY CASCADE');
    await runSqlDir(pool, seedDir);
    await pool.query(`INSERT INTO people (nickname, position, email, app_role) VALUES
      ('MC A', 'mc', 'mc.a@example.com', 'mc'), ('MC B', 'mc', 'mc.b@example.com', 'mc'), ('PD A', 'pd', 'pd.a@example.com', 'pd'), ('PD B', 'pd', NULL, 'pd'),
      ('Boss', 'operation', 'Boss@Example.com', 'admin'), ('MC C', 'mc', 'mc.c@example.com', 'mc')`);
    const { rows } = await pool.query('SELECT id::int, code FROM rooms');
    rooms = Object.fromEntries(rows.map((r) => [r.code, r.id]));
  });

  const call = async (method: string, path: string, body?: unknown, as?: string) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(as ? { 'x-dev-user': as } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  const draft = (room: string, from: string, to: string, mc = 1, pd = 3) => ({
    roomId: rooms[room],
    start: `${from}:00+07:00`,
    end: `${to}:00+07:00`,
    staff: [
      { personId: mc, role: 'mc' },
      { personId: pd, role: 'pd' },
    ],
  });


  const MC_A = 'mc.a@example.com';
  const MC_B = 'mc.b@example.com';
  const MC_C = 'mc.c@example.com';
  // People ids: 1 MC A, 2 MC B, 3 PD A, 4 PD B, 5 Boss (admin), 6 MC C.
  const fullDay = (d: string) => ({ start: `${d}T00:00:00+07:00`, end: new Date(Date.parse(`${d}T00:00:00+07:00`) + 86_400_000).toISOString() });

  const published = async (room: string, from: string, to: string, mc = 1, pd = 3) => {
    const id = (await call('POST', '/api/sessions', draft(room, from, to, mc, pd))).body.id;
    await pool.query(`UPDATE sessions SET status = 'published' WHERE id = $1`, [id]);
    return id as number;
  };

  it('keeps leave to two people per position per day, unless urgent', async () => {
    expect((await call('POST', '/api/leave', fullDay('2030-01-10'), MC_A)).status).toBe(201);
    expect((await call('POST', '/api/leave', fullDay('2030-01-10'), MC_B)).status).toBe(201);
    const third = await call('POST', '/api/leave', fullDay('2030-01-10'), MC_C);
    expect(third).toMatchObject({ status: 422, body: { violations: [{ code: 'leave_quota_full' }] } });

    const urgentNoReason = await call('POST', '/api/leave', { ...fullDay('2030-01-10'), kind: 'urgent' }, MC_C);
    expect(urgentNoReason.body.violations[0].code).toBe('urgent_needs_reason');
    const urgent = { ...fullDay('2030-01-10'), kind: 'urgent', reason: 'ป่วย' };
    expect((await call('POST', '/api/leave', urgent, MC_C)).status).toBe(409); // warning: over quota
    expect((await call('POST', '/api/leave', { ...urgent, confirm: true }, MC_C)).status).toBe(201);

    // A PD on the same day is a different quota.
    expect((await call('POST', '/api/leave', fullDay('2030-01-10'), 'pd.a@example.com')).status).toBe(201);
    // The team only sees its own requests; the admin sees all.
    expect((await call('GET', '/api/leave', undefined, MC_A)).body).toHaveLength(1);
    expect((await call('GET', '/api/leave')).body).toHaveLength(4);
  });

  it('approves every request on a day where an urgent one went over the quota', async () => {
    const a = (await call('POST', '/api/leave', fullDay('2030-01-20'), MC_A)).body.id;
    const b = (await call('POST', '/api/leave', fullDay('2030-01-20'), MC_B)).body.id;
    const urgent = { ...fullDay('2030-01-20'), kind: 'urgent', reason: 'ไม่สบาย', confirm: true };
    const c = (await call('POST', '/api/leave', urgent, MC_C)).body.id;

    // The two normal requests were within the quota when filed, so they approve cleanly.
    expect(await call('POST', `/api/leave/${a}/decision`, { decision: 'approve' })).toMatchObject({ status: 200, body: { violations: [] } });
    expect((await call('POST', `/api/leave/${b}/decision`, { decision: 'approve' })).status).toBe(200);
    // The urgent one is over the quota: a warning to confirm, never a block.
    const first = await call('POST', `/api/leave/${c}/decision`, { decision: 'approve' });
    expect(first).toMatchObject({ status: 409, body: { violations: [{ code: 'leave_quota_full', severity: 'warning' }] } });
    expect((await call('POST', `/api/leave/${c}/decision`, { decision: 'approve', confirm: true })).status).toBe(200);

    // A fourth, normal request on that day is still refused.
    await pool.query(`INSERT INTO people (nickname, position, email, app_role) VALUES ('MC D', 'mc', 'mc.d@example.com', 'mc')`);
    expect((await call('POST', '/api/leave', fullDay('2030-01-20'), 'mc.d@example.com')).body.violations[0].code).toBe('leave_quota_full');
  });

  it('refuses leave on a team off day, for urgent leave too', async () => {
    await call('POST', '/api/holidays', { name: 'ออฟตาราง', ...fullDay('2030-01-25') });
    const res = await call('POST', '/api/leave', fullDay('2030-01-25'), MC_A);
    expect(res).toMatchObject({ status: 422, body: { violations: [{ code: 'holiday_no_leave', detail: { date: '2030-01-25' } }] } });
    const urgent = await call('POST', '/api/leave', { ...fullDay('2030-01-25'), kind: 'urgent', reason: 'x', confirm: true }, MC_A);
    expect(urgent.body.violations[0].code).toBe('holiday_no_leave');
    expect((await call('POST', '/api/leave', fullDay('2030-01-26'), MC_A)).status).toBe(201);
  });

  it('caps normal leave at 8 days a month for full-time staff, not counting urgent leave', async () => {
    const days = (from: number, n: number) => ({
      start: `2030-05-${String(from).padStart(2, '0')}T00:00:00+07:00`,
      end: new Date(Date.parse(`2030-05-${String(from).padStart(2, '0')}T00:00:00+07:00`) + n * 86_400_000).toISOString(),
    });
    expect((await call('POST', '/api/leave', days(1, 5), MC_A)).status).toBe(201); // 5 days
    expect((await call('POST', '/api/leave', days(10, 3), MC_A)).status).toBe(201); // 8 days
    const ninth = await call('POST', '/api/leave', days(20, 1), MC_A);
    expect(ninth).toMatchObject({ status: 422, body: { violations: [{ code: 'leave_month_cap', detail: { month: '2030-05', used: 8, max: 8 } }] } });
    // Urgent leave is not counted, and the next month starts fresh.
    expect((await call('POST', '/api/leave', { ...days(21, 1), kind: 'urgent', reason: 'ป่วย' }, MC_A)).status).toBe(201);
    expect((await call('POST', '/api/leave', fullDay('2030-06-02'), MC_A)).status).toBe(201);
    // Guests have no cap.
    await pool.query(`UPDATE people SET employment = 'guest' WHERE id = 1`);
    expect((await call('POST', '/api/leave', days(25, 1), MC_A)).status).toBe(201);
  });

  it('lets only the admin decide, warning about sessions the person would miss', async () => {
    await published('TTS 1', '2030-01-11T10:00', '2030-01-11T12:00');
    const filed = await call('POST', '/api/leave', fullDay('2030-01-11'), MC_A);
    expect(filed.status).toBe(409);
    expect(filed.body.violations[0]).toMatchObject({ code: 'has_sessions', severity: 'warning' });
    const id = (await call('POST', '/api/leave', { ...fullDay('2030-01-11'), confirm: true }, MC_A)).body.id;

    expect((await call('POST', `/api/leave/${id}/decision`, { decision: 'approve' }, MC_A)).status).toBe(403);
    expect((await call('POST', `/api/leave/${id}/decision`, { decision: 'approve' })).status).toBe(409);
    expect((await call('POST', `/api/leave/${id}/decision`, { decision: 'approve', confirm: true })).status).toBe(200);
    expect((await call('POST', `/api/leave/${id}/decision`, { decision: 'reject' })).status).toBe(409); // already decided

    // Approved leave now blocks scheduling that person.
    const blocked = await call('POST', '/api/sessions', draft('TTS 2', '2030-01-11T14:00', '2030-01-11T16:00'));
    expect(blocked.body.violations.map((v: { code: string }) => v.code)).toContain('on_leave');
  });

  it('lets the person withdraw a pending request, freeing the quota place', async () => {
    const id = (await call('POST', '/api/leave', fullDay('2030-01-12'), MC_A)).body.id;
    await call('POST', '/api/leave', fullDay('2030-01-12'), MC_B);
    expect((await call('POST', `/api/leave/${id}/withdraw`, {}, MC_B)).status).toBe(404); // not hers
    expect((await call('POST', `/api/leave/${id}/withdraw`, {}, MC_A)).status).toBe(200);
    expect((await call('POST', '/api/leave', fullDay('2030-01-12'), MC_C)).status).toBe(201);
  });

  it('hands a session to someone else once the admin approves', async () => {
    const s = await published('TTS 1', '2030-01-13T10:00', '2030-01-13T12:00');
    const filed = await call('POST', '/api/swaps', { sessionId: s, targetId: 2, reason: 'ติดธุระ' }, MC_A);
    expect(filed.status).toBe(201);
    expect((await call('POST', '/api/swaps', { sessionId: s, targetId: 1 }, MC_B)).body.violations[0].code).toBe('not_your_session');

    expect((await call('POST', `/api/swaps/${filed.body.id}/decision`, { decision: 'approve' })).status).toBe(200);
    const { rows } = await pool.query('SELECT person_id::int FROM session_staff WHERE session_id = $1 ORDER BY role', [s]);
    expect(rows.map((r) => r.person_id)).toEqual([2, 3]);
  });

  it('trades places at the same time without tripping the overlap rule', async () => {
    const a = await published('TTS 1', '2030-01-14T10:00', '2030-01-14T12:00', 1, 3);
    const b = await published('SHP 1', '2030-01-14T10:00', '2030-01-14T12:00', 2, 4);
    const id = (await call('POST', '/api/swaps', { sessionId: a, targetId: 2, targetSessionId: b }, MC_A)).body.id;
    expect((await call('POST', `/api/swaps/${id}/decision`, { decision: 'approve' })).body.ok).toBe(true);
    const staff = async (sid: number) =>
      (await pool.query(`SELECT person_id::int FROM session_staff WHERE session_id = $1 AND role = 'mc'`, [sid])).rows[0].person_id;
    expect([await staff(a), await staff(b)]).toEqual([2, 1]);
  });

  it('refuses a swap that would double-book the person taking over', async () => {
    const a = await published('TTS 1', '2030-01-15T10:00', '2030-01-15T12:00', 1, 3);
    await published('SHP 1', '2030-01-15T11:00', '2030-01-15T13:00', 2, 4);
    const id = (await call('POST', '/api/swaps', { sessionId: a, targetId: 2 }, MC_A)).body.id;
    const res = await call('POST', `/api/swaps/${id}/decision`, { decision: 'approve' });
    expect(res.status).toBe(422);
    expect(res.body.violations[0].code).toBe('person_busy');
  });

  it('blocks the schedule on a team off day', async () => {
    const off = await call('POST', '/api/holidays', { name: 'ประชุมใหญ่', ...fullDay('2030-01-16') });
    expect(off.status).toBe(201);
    expect((await call('POST', '/api/holidays', { name: 'x', ...fullDay('2030-01-17') }, MC_A)).status).toBe(403);
    const res = await call('POST', '/api/sessions', draft('TTS 1', '2030-01-16T10:00', '2030-01-16T12:00'));
    expect(res.body.violations.map((v: { code: string }) => v.code)).toContain('holiday');
    expect((await call('DELETE', `/api/holidays/${off.body.id}`)).status).toBe(200);
  });

  it('compares hours with KPI for regular staff only', async () => {
    await pool.query(`INSERT INTO people (nickname, position, employment) VALUES ('P-Arm', 'mc', 'guest'), ('FL-Kaew', 'pd', 'freelance')`);
    // ids 7 P-Arm (guest MC), 8 FL-Kaew (freelance PD)
    await published('TTS 1', '2030-02-03T10:00', '2030-02-03T14:00', 1, 3); // 4 h: MC A as MC, PD A as PD
    await published('TTS 2', '2030-02-04T10:00', '2030-02-04T12:00', 3, 8); // 2 h: PD A hosts as MC, FL-Kaew PD
    await published('TTS 3', '2030-02-05T10:00', '2030-02-05T12:00', 7, 4); // 2 h: guest MC
    const cancelled = await published('SHP 1', '2030-02-06T10:00', '2030-02-06T11:00', 1, 4);
    await call('POST', `/api/sessions/${cancelled}/cancel`, { reason: 'ประชุมทีม' }); // still counts
    await call('POST', '/api/sessions', draft('SHP 2', '2030-02-07T10:00', '2030-02-07T12:00', 2, 4)); // draft: no hours

    const { body } = await call('GET', '/api/hours?month=2030-02');
    const row = (name: string) => body.rows.find((r: { nickname: string }) => r.nickname === name);
    expect(row('MC A')).toMatchObject({ mcHours: 5, kpiHours: 96, ownRoleHours: 5, vsKpi: -91, cancelledCountedHours: 1 });
    expect(row('PD A')).toMatchObject({ pdHours: 4, mcHours: 2, kpiHours: 132, ownRoleHours: 4, crossRoleHours: 2 });
    expect(row('P-Arm')).toMatchObject({ mcHours: 2, kpiHours: null, vsKpi: null });
    expect(row('FL-Kaew')).toMatchObject({ pdHours: 2, kpiHours: null });
    expect(row('MC B')).toMatchObject({ totalHours: 0 });

    const own = await call('GET', '/api/hours?month=2030-02', undefined, MC_A);
    expect(own.body.rows).toHaveLength(1);
    expect((await call('GET', '/api/hours?month=2030-13')).status).toBe(400);
  });

  it('reads a screenshot into a draft, then saves readings with per-broadcast deltas', async () => {
    const s = await published('TTS 1', '2030-03-01T10:00', '2030-03-01T14:00', 1, 3);
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect((await call('POST', '/api/results/read', { sessionId: s, image: png }, MC_B)).status).toBe(403); // not her session
    const read = await call('POST', '/api/results/read', { sessionId: s, image: png }, 'pd.a@example.com');
    expect(read.body).toMatchObject({ reading: { gmv: 12500 }, liveStartedAt: '2030-03-01T03:02:00.000Z', isNewBroadcast: true, boxes: [] });
    const sized = await call('POST', '/api/results/read', { sessionId: s, image: png, width: 800, height: 400 }, 'pd.a@example.com');
    expect(sized.body.boxes).toEqual([
      { field: 'gmv', x: 0.125, y: 0.125, w: 0.25, h: 0.1 },
      { field: 'extra:GPM', x: 0.4375, y: 0.95, w: 0.125, h: expect.closeTo(0.05) },
    ]);
    expect((await call('POST', '/api/results/read', { sessionId: s, image: 'nope' }, 'pd.a@example.com')).status).toBe(400);

    const save = (capturedAt: string, gmv: number, orders: number, isNewBroadcast: boolean) =>
      call('POST', '/api/results', {
        sessionId: s, capturedAt: `${capturedAt}:00+07:00`, liveStartedAt: read.body.liveStartedAt, isNewBroadcast,
        metrics: { gmv, orders }, source: 'ai',
      }, 'pd.a@example.com');
    expect((await save('2030-03-01T11:00', 12500, 9, true)).status).toBe(201);
    // Same start time: the flag suggestion says it continues.
    expect((await call('GET', `/api/results/flag?sessionId=${s}&liveStartedAt=2030-03-01T03:02:00Z`, undefined, 'pd.a@example.com')).body.isNewBroadcast).toBe(false);
    expect((await save('2030-03-01T12:00', 20000, 15, false)).status).toBe(201);
    expect((await save('2030-03-01T13:00', 3000, 2, true)).status).toBe(201); // restarted the live

    const list = await call('GET', '/api/results?from=2030-03-01T00:00:00%2B07:00&to=2030-03-02T00:00:00%2B07:00');
    expect(list.body.map((r: { gmvDelta: number }) => r.gmvDelta)).toEqual([3000, 7500, 12500]);
    // Recorded the next morning: still listed under the session's day, not the day it was typed in.
    expect((await save('2030-03-02T09:30', 3500, 3, false)).status).toBe(201);
    const again = await call('GET', '/api/results?from=2030-03-01T00:00:00%2B07:00&to=2030-03-02T00:00:00%2B07:00');
    expect(again.body).toHaveLength(4);
    expect((await call('POST', '/api/results', { sessionId: s, isNewBroadcast: true, metrics: { gmv: -1 } }, 'pd.a@example.com')).status).toBe(400);
  });

  it('continues only from a session that ends right when this one starts, and that has a result', async () => {
    const first = await published('TTS 2', '2030-03-02T10:00', '2030-03-02T12:00', 1, 3);
    const second = await published('TTS 2', '2030-03-02T12:00', '2030-03-02T14:00', 2, 4);
    const afterGap = await published('TTS 2', '2030-03-02T17:00', '2030-03-02T19:00', 6, 3);
    const other = await published('TTS 3', '2030-03-02T14:00', '2030-03-02T16:00', 6, 3);
    const flag = async (id: number) => (await call('GET', `/api/results/flag?sessionId=${id}`)).body;
    expect(await flag(first)).toMatchObject({ isNewBroadcast: true, canContinue: false });
    // The session before has no result yet: nothing to subtract.
    expect(await flag(second)).toMatchObject({ isNewBroadcast: true, canContinue: false, previousSessionId: first, previousHasResult: false });
    await call('POST', '/api/results', { sessionId: first, isNewBroadcast: true, capturedAt: '2030-03-02T11:58:00+07:00', metrics: { gmv: 1000 } });
    expect(await flag(second)).toMatchObject({ isNewBroadcast: false, canContinue: true, previousHasResult: true });
    expect(await flag(afterGap)).toMatchObject({ isNewBroadcast: true, canContinue: false }); // 14:00-17:00 gap
    expect(await flag(other)).toMatchObject({ isNewBroadcast: true, canContinue: false }); // another room
  });

  it('never continues across a gap, and an edit fixes a wrong flag for the readings after it', async () => {
    const day = '2030-03-04';
    const a = await published('TTS 1', `${day}T12:00`, `${day}T14:00`, 1, 3);
    const b = await published('TTS 1', `${day}T17:00`, `${day}T19:00`, 2, 3);
    const c = await published('TTS 1', `${day}T19:00`, `${day}T21:00`, 6, 3);
    const save = (sessionId: number, at: string, gmv: number, isNewBroadcast: boolean, extra = {}) =>
      call('POST', '/api/results', { sessionId, isNewBroadcast, capturedAt: `${day}T${at}:00+07:00`, metrics: { gmv }, ...extra }, 'pd.a@example.com');
    const deltas = async () =>
      (await call('GET', `/api/results?from=${day}T00:00:00%2B07:00&to=2030-03-05T06:00:00%2B07:00`)).body
        .map((r: { sessionId: number; gmvDelta: number }) => [r.sessionId, r.gmvDelta]);

    await save(a, '13:58', 101724, true);
    // "Continues" picked by hand after a gap: saved as a new broadcast anyway.
    await save(b, '19:03', 23438, false);
    expect(await deltas()).toEqual([[b, 23438], [a, 101724]]);

    // An old wrong reading (from before this fix) continued A across the gap; C continued B.
    await pool.query('DELETE FROM live_results WHERE session_id = $1', [b]);
    const aId = (await pool.query('SELECT id FROM live_results WHERE session_id = $1', [a])).rows[0].id;
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const wrong = (await pool.query(
      `INSERT INTO live_results (session_id, room_id, broadcast_id, is_new_broadcast, captured_at, gmv, recorded_by)
       VALUES ($1, $2, $3, false, '${day}T19:03:00+07:00', 23438, 3) RETURNING id::int`, [b, rooms['TTS 1'], aId])).rows[0].id;
    await pool.query(`INSERT INTO live_result_images (result_id, media_type, data) VALUES ($1, 'image/png', decode('iVBORw0KGgo=', 'base64'))`, [wrong]);
    await save(c, '21:02', 64579, false);
    expect(await deltas()).toEqual([[c, 41141], [b, -78286], [a, 101724]]);

    const edit = await call('PUT', `/api/results/${wrong}`, {
      isNewBroadcast: true, capturedAt: `${day}T19:03:00+07:00`, metrics: { gmv: 23438 }, note: 'fixed flag',
    }, 'pd.a@example.com');
    expect(edit.status).toBe(200);
    expect(await deltas()).toEqual([[c, 41141], [b, 23438], [a, 101724]]);
    // The edit keeps the screenshot; the old version is gone from the list, the new one is v2.
    expect((await call('GET', `/api/results/${edit.body.id}/image`, undefined, 'pd.a@example.com')).body.url).toBe(png);
    const list = (await call('GET', `/api/results?from=${day}T00:00:00%2B07:00&to=2030-03-05T00:00:00%2B07:00`)).body;
    expect(list.find((r: { sessionId: number }) => r.sessionId === b)).toMatchObject({ version: 2, note: 'fixed flag', hasImage: true });
    expect((await call('PUT', `/api/results/${wrong}`, { isNewBroadcast: true, metrics: { gmv: 1 } }, 'pd.a@example.com')).status).toBe(409);
    expect((await call('PUT', `/api/results/${edit.body.id}`, { isNewBroadcast: true, metrics: { gmv: 1 } }, 'mc.c@example.com')).status).toBe(403);

    // A screenshot sent with a new reading is stored with it.
    const withShot = await save(a, '13:59', 101800, false, { image: png, width: 10, height: 20, boxes: [{ field: 'gmv', x: 0, y: 0, w: 1, h: 1 }] });
    expect((await call('GET', `/api/results/${withShot.body.id}/image`)).body).toMatchObject({ url: png, width: 10, height: 20 });
    // Deleting the edited reading removes its history too.
    expect((await call('DELETE', `/api/results/${edit.body.id}`)).status).toBe(404); // C still continues it
    expect((await call('DELETE', `/api/results/${(list[0] as { id: number }).id}`, undefined, 'pd.a@example.com')).body.ok).toBe(true);
    expect((await call('DELETE', `/api/results/${edit.body.id}`, undefined, 'pd.a@example.com')).body.ok).toBe(true);
    expect((await pool.query('SELECT count(*)::int AS n FROM live_results WHERE session_id = $1', [b])).rows[0].n).toBe(0);
  });

  it('closes recording on the 25th of the next month, edits after 7 days, and fines missing results', async () => {
    // May 2020: closed long ago. PD A missed one session, recorded none; admin back-recorded one late.
    const missed = await published('TTS 1', '2020-05-10T10:00', '2020-05-10T12:00', 1, 3);
    const late = await published('TTS 1', '2020-05-11T10:00', '2020-05-11T12:00', 1, 3);
    expect((await call('POST', '/api/results', { sessionId: missed, isNewBroadcast: true, metrics: { gmv: 5 } }, 'pd.a@example.com')))
      .toMatchObject({ status: 422, body: { error: 'record_closed' } });
    const byAdmin = await call('POST', '/api/results', { sessionId: late, isNewBroadcast: true, capturedAt: '2020-05-11T11:55:00+07:00', metrics: { gmv: 700 } });
    expect(byAdmin.status).toBe(201);
    expect((await call('PUT', `/api/results/${byAdmin.body.id}`, { isNewBroadcast: true, metrics: { gmv: 800 } }, 'pd.a@example.com')))
      .toMatchObject({ status: 422, body: { error: 'edit_closed' } });
    expect((await call('GET', `/api/results/flag?sessionId=${missed}`, undefined, 'pd.a@example.com')).body)
      .toMatchObject({ canRecord: false, canEdit: false, cutoff: '2020-06-24T17:00:00.000Z' });

    const sum = (await call('GET', '/api/results/summary?month=2020-05')).body;
    expect(sum).toMatchObject({ closed: true, totals: { gmv: 700, ended: 2, recorded: 1, missing: 1 } });
    expect(sum.sessions.map((s: { status: string; fined: boolean }) => [s.status, s.fined])).toEqual([['missing', true], ['late', true]]);
    expect(sum.byPerson.find((p: { nickname: string }) => p.nickname === 'PD A')).toMatchObject({ missing: 2, deduction: 1000 });
    expect(sum.byPerson.find((p: { nickname: string }) => p.nickname === 'MC A')).toMatchObject({ missing: 0, deduction: 0, gmvMc: 700 });
    // Recording is the PD's job: the MC is never fined, even when the session has no PD.
    expect(sum.sessions[0].responsible).toEqual([3]);
    // The team sees only their own sessions and row.
    const mine = (await call('GET', '/api/results/summary?month=2020-05', undefined, 'mc.b@example.com')).body;
    expect(mine).toMatchObject({ totals: { sessions: 0 }, byPerson: [] });

    // The payroll workbook carries the deduction and a list of missing results.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await (await fetch(`${base}/api/export/payroll?month=2020-05`)).arrayBuffer()) as unknown as ExcelJS.Buffer);
    const pdA = wb.getWorksheet('Summary')!.getRows(2, 5)!.find((r) => r.getCell(1).value === 'PD A')!;
    expect([pdA.getCell('N').value, pdA.getCell('O').value]).toEqual([2, 1000]);
    expect(wb.getWorksheet('Missing results')!.rowCount).toBe(3);
    // Sessions sheet: the result status on every line, the 500 only on the PD's line.
    const lines = wb.getWorksheet('Sessions')!.getRows(2, 4)!.map((r) => [r.getCell('F').value, r.getCell('O').value, r.getCell('P').value ?? null]);
    expect(lines).toEqual(expect.arrayContaining([['PD A', 'missing', 500], ['MC A', 'missing', null], ['PD A', 'late', 500]]));
  });

  it('exports the month for payroll, without guests, with a freelance sheet', async () => {
    await pool.query(`INSERT INTO people (nickname, position, employment) VALUES ('P-Arm', 'mc', 'guest'), ('FL-Kaew', 'pd', 'freelance')`);
    const a = await published('TTS 1', '2030-04-02T10:00', '2030-04-02T12:00', 1, 8);
    await published('TTS 2', '2030-04-03T10:00', '2030-04-03T13:00', 7, 8);
    await call('POST', '/api/results', { sessionId: a, isNewBroadcast: true, capturedAt: '2030-04-02T11:55:00+07:00', metrics: { gmv: 9000 } });

    expect((await fetch(`${base}/api/export/payroll?month=2030-04`, { headers: { 'x-dev-user': MC_A } })).status).toBe(403);
    const res = await fetch(`${base}/api/export/payroll?month=2030-04`);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Sessions', 'Freelance', 'Missing results']);

    const names = (sheet: string, col: string) =>
      wb.getWorksheet(sheet)!.getColumn(col).values.slice(2).filter((v) => typeof v === 'string');
    expect(names('Summary', 'A')).toEqual(expect.arrayContaining(['MC A', 'FL-Kaew']));
    expect(names('Summary', 'A')).not.toContain('P-Arm');
    expect(names('Sessions', 'F')).not.toContain('P-Arm');
    const fl = wb.getWorksheet('Freelance')!;
    expect(fl.getRow(2).getCell('F').value).toBe('FL-Kaew');
    expect(fl.getRow(4).values).toEqual(expect.arrayContaining(['Total FL-Kaew', 5, '2 lives', 9000]));
    const mcA = wb.getWorksheet('Summary')!.getRows(2, 5)!.find((r) => r.getCell(1).value === 'MC A')!;
    expect(mcA.getCell('L').value).toBe(9000);
  });
});
