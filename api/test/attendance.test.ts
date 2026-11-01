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
    await pool.query('TRUNCATE attendance, session_staff, sessions, studios, people RESTART IDENTITY CASCADE');
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

    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
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
});
