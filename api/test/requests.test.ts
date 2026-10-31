import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
    expect(read.body).toMatchObject({ reading: { gmv: 12500 }, liveStartedAt: '2030-03-01T03:02:00.000Z', isNewBroadcast: true });
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
    expect((await call('POST', '/api/results', { sessionId: s, isNewBroadcast: true, metrics: { gmv: -1 } }, 'pd.a@example.com')).status).toBe(400);
  });
});
