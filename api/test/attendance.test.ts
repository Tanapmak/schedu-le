import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { checkArea, countedHours, distanceM } from '../src/attendance.js';
import { migrationsDir, seedDir } from '../src/paths.js';
import { migrate, runSqlDir } from '../src/sqlFiles.js';

const url = process.env.TEST_DATABASE_URL;

describe('geofence helpers', () => {
  const studio = { id: 1, name: 'S', lat: 13.7563, lng: 100.5018, radiusM: 100 };
  it('measures distance in metres', () => {
    expect(Math.round(distanceM({ lat: 13.7563, lng: 100.5018 }, { lat: 13.7572, lng: 100.5018 }))).toBe(100);
  });
  it('is in area inside the radius, out beyond it, out with no location', () => {
    expect(checkArea({ location: 'studio', offsite: null }, [studio], { lat: 13.7565, lng: 100.5018 })).toMatchObject({ inArea: true, distanceM: 22 });
    expect(checkArea({ location: 'studio', offsite: null }, [studio], { lat: 13.7663, lng: 100.5018 }).inArea).toBe(false);
    expect(checkArea({ location: 'studio', offsite: null }, [studio], null)).toEqual({ inArea: false, distanceM: null });
  });
  it('skips the check for home sessions and when no studio is set', () => {
    expect(checkArea({ location: 'home', offsite: null }, [studio], null).inArea).toBe(true);
    expect(checkArea({ location: 'studio', offsite: null }, [], null).inArea).toBe(true);
  });
  it('counts only time inside the session, cuts a forgotten clock-out at the session end', () => {
    const session = { start: '2030-01-01T08:00:00Z', end: '2030-01-01T10:00:00Z' };
    const base = { status: 'ok' as const, adjustedHours: null };
    expect(countedHours({ ...base, clockInAt: '2030-01-01T07:40:00Z', clockOutAt: '2030-01-01T10:05:00Z' }, session, new Date('2030-01-02')).hours).toBe(2);
    expect(countedHours({ ...base, clockInAt: '2030-01-01T08:12:00Z', clockOutAt: '2030-01-01T10:00:00Z' }, session, new Date('2030-01-02')).hours).toBe(1.8);
    expect(countedHours({ ...base, clockInAt: '2030-01-01T08:00:00Z', clockOutAt: null }, session, new Date('2030-01-01T11:30:00Z'))).toEqual({ hours: 2, forgotOut: true });
    expect(countedHours({ ...base, status: 'rejected', clockInAt: '2030-01-01T08:00:00Z', clockOutAt: '2030-01-01T10:00:00Z' }, session, new Date()).hours).toBe(0);
    expect(countedHours({ ...base, adjustedHours: 1.5, clockInAt: '2030-01-01T08:00:00Z', clockOutAt: null }, session, new Date()).hours).toBe(1.5);
  });
});

describe.skipIf(!url)('clock in / clock out', () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  const MC_A = 'mc.a@example.com';
  const BOSS = 'boss@example.com';
  const IN = { lat: 13.7564, lng: 100.5019 };
  const FAR = { lat: 13.8, lng: 100.6 };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 5 });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const client = await pool.connect();
    await migrate(client, migrationsDir);
    client.release();
    server = createApp(pool, { mode: 'dev' }, { readScreenshot: undefined }).listen(0);
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE attendance_corrections, attendance, session_staff, sessions, studios, people RESTART IDENTITY CASCADE');
    await runSqlDir(pool, seedDir);
    await pool.query(`INSERT INTO people (nickname, position, email, app_role) VALUES
      ('MC A', 'mc', 'mc.a@example.com', 'mc'), ('PD A', 'pd', 'pd.a@example.com', 'pd'), ('Boss', 'operation', 'boss@example.com', 'admin')`);
    await pool.query(`INSERT INTO studios (name, lat, lng, radius_m) VALUES ('Studio', 13.7563, 100.5018, 100)`);
  });

  const call = async (method: string, path: string, body?: unknown, as = MC_A) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-dev-user': as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  /** A published TTS 1 session for MC A and PD A starting `fromMin` minutes from now. */
  const sessionIn = async (fromMin: number, lengthMin = 120) => {
    const start = new Date(Date.now() + fromMin * 60_000);
    const end = new Date(start.getTime() + lengthMin * 60_000);
    const { rows } = await pool.query(
      `INSERT INTO sessions (room_id, period, status) VALUES ((SELECT id FROM rooms WHERE code = 'TTS 1'), tstzrange($1, $2), 'published') RETURNING id::int`,
      [start, end],
    );
    await pool.query(`INSERT INTO session_staff (session_id, person_id, role) VALUES ($1, 1, 'mc'), ($1, 2, 'pd')`, [rows[0].id]);
    return rows[0].id as number;
  };

  it('clocks in inside the area from 30 minutes before the session, then out', async () => {
    const id = await sessionIn(20);
    const me = await call('GET', '/api/attendance/me');
    expect(me.body.session.id).toBe(id);
    expect(me.body.windowMinutes).toBe(30);
    const inRes = await call('POST', '/api/attendance/clock-in', IN);
    expect(inRes.status).toBe(201);
    expect(inRes.body).toMatchObject({ ok: true, inArea: true, status: 'ok' });
    expect((await call('POST', '/api/attendance/clock-in', IN)).body.error).toBe('already_clocked_in');
    expect((await call('GET', '/api/attendance/me')).body.open.sessionId).toBe(id);
    expect((await call('POST', '/api/attendance/clock-out', IN)).status).toBe(200);
    expect((await call('POST', '/api/attendance/clock-out', IN)).body.error).toBe('not_clocked_in');
  });

  it('refuses before the window opens and says when it opens', async () => {
    await sessionIn(90);
    const res = await call('POST', '/api/attendance/clock-in', IN);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('too_early');
    expect(Date.parse(res.body.opensAt)).toBeGreaterThan(Date.now() + 55 * 60_000);
  });

  it('needs a reason out of the area, then waits for the admin', async () => {
    await sessionIn(-10);
    expect((await call('POST', '/api/attendance/clock-in', FAR)).body.error).toBe('out_of_area_needs_reason');
    const res = await call('POST', '/api/attendance/clock-in', { ...FAR, reason: 'ไลฟ์นอกสถานที่' });
    expect(res.body).toMatchObject({ ok: true, inArea: false, status: 'pending' });

    // The live day the session started on (a live day runs 06:00 to 06:00, Bangkok).
    const today = new Date(Date.now() - 10 * 60_000 + 1 * 3_600_000).toISOString().slice(0, 10);
    expect((await call('GET', `/api/attendance?date=${today}`)).status).toBe(403);
    const day = await call('GET', `/api/attendance?date=${today}`, undefined, BOSS);
    const row = day.body.rows.find((r: any) => r.personId === 1);
    expect(row.attendance).toMatchObject({ status: 'pending', offsiteReason: 'ไลฟ์นอกสถานที่' });
    expect(row.lateMin).toBeGreaterThanOrEqual(9);
    expect(row.state).toBe('working');
    expect(day.body.rows.find((r: any) => r.personId === 2).state).toBe('not_in');

    expect((await call('POST', `/api/attendance/${row.attendance.id}/decision`, { decision: 'reject' }, BOSS)).body.ok).toBe(true);
    let again = await call('GET', `/api/attendance?date=${today}`, undefined, BOSS);
    expect(again.body.rows.find((r: any) => r.personId === 1).countedHours).toBe(0);
    await call('POST', `/api/attendance/${row.attendance.id}/adjust`, { hours: 1.5, note: 'ok' }, BOSS);
    again = await call('GET', `/api/attendance?date=${today}`, undefined, BOSS);
    expect(again.body.rows.find((r: any) => r.personId === 1).countedHours).toBe(1.5);
  });

  it('has nothing to clock in for without a session', async () => {
    expect((await call('POST', '/api/attendance/clock-in', IN)).body.error).toBe('no_session');
  });

  it('lets the admin set the studio area', async () => {
    const list = await call('GET', '/api/studios');
    const res = await call('POST', '/api/studios', { id: list.body[0].id, name: 'Studio', lat: 13.8, lng: 100.6, radiusM: 150 }, BOSS);
    expect(res.body.ok).toBe(true);
    expect((await call('GET', '/api/studios')).body[0]).toMatchObject({ lat: 13.8, radiusM: 150 });
    expect((await call('POST', '/api/studios', { name: 'x', lat: 1, lng: 1 })).status).toBe(403);
  });

  it('lets someone who forgot ask for a time correction, only from the studio', async () => {
    const id = await sessionIn(-150, 120); // started 2.5 h ago, ended 30 min ago, never clocked in
    const me = await call('GET', '/api/attendance/me');
    expect(me.body.correctable.find((s: any) => s.id === id)).toMatchObject({ attendance: null, pendingCorrectionId: null });

    const start = Date.now() - 150 * 60_000;
    const ask = { sessionId: id, clockInAt: new Date(start - 5 * 60_000).toISOString(), clockOutAt: new Date(start + 120 * 60_000).toISOString(), reason: 'ลืมกด' };
    expect((await call('POST', '/api/attendance/corrections', { ...ask, ...FAR })).body.error).toBe('out_of_area');
    expect((await call('POST', '/api/attendance/corrections', ask)).body.error).toBe('location_needed');
    expect((await call('POST', '/api/attendance/corrections', { ...ask, clockOutAt: null, ...IN })).body.error).toBe('both_times_needed');
    expect((await call('POST', '/api/attendance/corrections', { ...ask, clockOutAt: new Date(Date.now() + 60_000).toISOString(), ...IN })).body.error).toBe('time_outside_session');
    expect((await call('POST', '/api/attendance/corrections', { ...ask, reason: '', ...IN })).status).toBe(400);

    const made = await call('POST', '/api/attendance/corrections', { ...ask, ...IN });
    expect(made.status).toBe(201);
    expect((await call('POST', '/api/attendance/corrections', { ...ask, ...IN })).body.error).toBe('already_pending');

    // Members see only their own; PD A sees nothing and cannot decide.
    expect((await call('GET', '/api/attendance/corrections', undefined, 'pd.a@example.com')).body).toEqual([]);
    expect((await call('POST', `/api/attendance/corrections/${made.body.id}/decision`, { decision: 'approve' })).status).toBe(403);

    const list = await call('GET', '/api/attendance/corrections', undefined, BOSS);
    expect(list.body[0]).toMatchObject({ nickname: 'MC A', status: 'pending', current: null, reason: 'ลืมกด' });
    expect((await call('POST', `/api/attendance/corrections/${made.body.id}/decision`, { decision: 'approve' }, BOSS)).status).toBe(200);
    expect((await call('POST', `/api/attendance/corrections/${made.body.id}/decision`, { decision: 'reject' }, BOSS)).body.error).toBe('already_decided');

    const { rows } = await pool.query(`SELECT clock_in_at, clock_out_at, in_area, status, correction_id::int FROM attendance WHERE session_id = $1 AND person_id = 1`, [id]);
    expect(rows[0]).toMatchObject({ in_area: true, status: 'ok', correction_id: made.body.id });
    expect(new Date(rows[0].clock_out_at).toISOString()).toBe(ask.clockOutAt);
  });

  it('fixes only the forgotten clock-out of an open record, and can be withdrawn or rejected', async () => {
    const id = await sessionIn(-100, 60); // ended 40 min ago
    // Clocked in on time, then forgot to clock out.
    await pool.query(`INSERT INTO attendance (person_id, session_id, clock_in_at, in_area) VALUES (1, $1, now() - interval '100 minutes', true)`, [id]);
    const out = new Date(Date.now() - 40 * 60_000).toISOString();
    const first = await call('POST', '/api/attendance/corrections', { sessionId: id, clockOutAt: out, reason: 'ลืม clock out', ...IN });
    expect((await call('POST', `/api/attendance/corrections/${first.body.id}/withdraw`)).body.ok).toBe(true);
    expect((await call('POST', `/api/attendance/corrections/${first.body.id}/withdraw`)).status).toBe(404);

    const second = await call('POST', '/api/attendance/corrections', { sessionId: id, clockOutAt: out, reason: 'ลืม clock out', ...IN });
    await call('POST', `/api/attendance/corrections/${second.body.id}/decision`, { decision: 'reject' }, BOSS);
    expect((await call('GET', '/api/attendance/me')).body.open).not.toBeNull();

    const third = await call('POST', '/api/attendance/corrections', { sessionId: id, clockOutAt: out, reason: 'ลืม clock out', ...IN });
    await call('POST', `/api/attendance/corrections/${third.body.id}/decision`, { decision: 'approve' }, BOSS);
    const me = await call('GET', '/api/attendance/me');
    expect(me.body.open).toBeNull();
    expect(me.body.records[0]).toMatchObject({ clockOutAt: out, correctionId: third.body.id });
    expect(me.body.corrections.map((c: any) => c.status)).toEqual(['approved', 'rejected', 'withdrawn']);
  });

  it('cannot correct a session from more than a week ago, or someone else\'s', async () => {
    const old = await sessionIn(-8 * 24 * 60, 60);
    const at = new Date(Date.now() - 8 * 86_400_000).toISOString();
    expect((await call('POST', '/api/attendance/corrections', { sessionId: old, clockInAt: at, clockOutAt: at, reason: 'x', ...IN })).status).toBe(404);
    const recent = await sessionIn(-90, 60);
    expect((await call('POST', '/api/attendance/corrections', { sessionId: recent, reason: 'x', ...IN }, BOSS)).status).toBe(404);
  });
});
