import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { migrationsDir, seedDir } from '../src/paths.js';
import { migrate, runSqlDir } from '../src/sqlFiles.js';

// Needs a throwaway Postgres: this test drops and recreates the public schema.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('sessions API', () => {
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
    server = createApp(pool).listen(0);
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE session_staff, sessions, leave_requests, holidays, people RESTART IDENTITY CASCADE');
    await runSqlDir(pool, seedDir);
    await pool.query(`INSERT INTO people (nickname, position) VALUES ('MC A', 'mc'), ('MC B', 'mc'), ('PD A', 'pd'), ('PD B', 'pd')`);
    const { rows } = await pool.query('SELECT id::int, code FROM rooms');
    rooms = Object.fromEntries(rows.map((r) => [r.code, r.id]));
  });

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json' },
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

  it('creates a draft and shows it on the board', async () => {
    const created = await call('POST', '/api/sessions', draft('TTS 1', '2026-11-05T10:00', '2026-11-05T12:00'));
    expect(created).toMatchObject({ status: 201, body: { ok: true, violations: [] } });

    const board = await call('GET', '/api/board?from=2026-11-05T00:00:00%2B07:00&to=2026-11-06T00:00:00%2B07:00');
    expect(board.body.sessions).toHaveLength(1);
    expect(board.body.sessions[0]).toMatchObject({
      roomId: rooms['TTS 1'],
      status: 'draft',
      start: '2026-11-05T03:00:00.000Z',
      staff: [
        { personId: 1, role: 'mc', replaced: false },
        { personId: 3, role: 'pd', replaced: false },
      ],
    });
  });

  it('refuses clashes with the rule codes and saves nothing', async () => {
    await call('POST', '/api/sessions', draft('TTS 1', '2026-11-05T10:00', '2026-11-05T12:00'));
    const clash = await call('POST', '/api/sessions', draft('SHP 1', '2026-11-05T11:00', '2026-11-05T13:00', 2, 3));
    expect(clash.status).toBe(422);
    expect(clash.body.violations).toMatchObject([{ code: 'person_busy', personId: 3 }]);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM sessions');
    expect(rows[0].n).toBe(1);
  });

  it('asks for confirmation on warnings, then saves', async () => {
    await pool.query(`INSERT INTO leave_requests (person_id, period) VALUES (1, tstzrange('2026-11-05 00:00+07', '2026-11-06 00:00+07'))`);
    const withPendingLeave = draft('TTS 1', '2026-11-05T10:00', '2026-11-05T11:00');
    const first = await call('POST', '/api/sessions', withPendingLeave);
    expect(first.status).toBe(409);
    expect(first.body.violations).toMatchObject([{ code: 'leave_pending', severity: 'warning', personId: 1 }]);
    const confirmed = await call('POST', '/api/sessions', { ...withPendingLeave, confirm: true });
    expect(confirmed.status).toBe(201);
  });

  it('checks without saving', async () => {
    const res = await call('POST', '/api/sessions/check', { ...draft('TTS 1', '2026-11-05T10:00', '2026-11-05T12:00'), staff: [] });
    expect(res.body.violations.map((v: { code: string }) => v.code)).toEqual(['missing_mc', 'missing_pd']);
  });

  it('moves a session without clashing with itself', async () => {
    const { body } = await call('POST', '/api/sessions', draft('TTS 1', '2026-11-05T10:00', '2026-11-05T12:00'));
    const moved = await call('PUT', `/api/sessions/${body.id}`, draft('TTS 1', '2026-11-05T11:00', '2026-11-05T13:00'));
    expect(moved).toMatchObject({ status: 200, body: { ok: true } });
  });

  it('publishes drafts in a range, cancels with a reason, and only deletes drafts', async () => {
    const a = (await call('POST', '/api/sessions', draft('TTS 1', '2026-11-05T10:00', '2026-11-05T12:00'))).body.id;
    const b = (await call('POST', '/api/sessions', draft('TTS 1', '2026-11-12T10:00', '2026-11-12T12:00'))).body.id;

    const pub = await call('POST', '/api/publish', { from: '2026-11-02T00:00:00+07:00', to: '2026-11-09T00:00:00+07:00' });
    expect(pub.body).toEqual({ published: 1 });

    expect((await call('DELETE', `/api/sessions/${a}`)).status).toBe(404); // published: cancel instead
    expect((await call('POST', `/api/sessions/${a}/cancel`, {})).status).toBe(400);
    expect((await call('POST', `/api/sessions/${a}/cancel`, { reason: 'ไฟดับ' })).status).toBe(200);
    expect((await call('DELETE', `/api/sessions/${b}`)).status).toBe(200);

    // The cancelled slot is free again.
    expect((await call('POST', '/api/sessions', draft('TTS 1', '2026-11-05T10:00', '2026-11-05T12:00'))).status).toBe(201);
  });

  it('merges back-to-back sessions with the same people into one', async () => {
    const a = (await call('POST', '/api/sessions', draft('TTS 3', '2026-11-05T14:00', '2026-11-05T16:00'))).body.id;
    const b = (await call('POST', '/api/sessions', draft('TTS 3', '2026-11-05T16:00', '2026-11-05T18:00'))).body.id;
    const other = (await call('POST', '/api/sessions', draft('TTS 3', '2026-11-05T18:00', '2026-11-05T19:00', 2, 4))).body.id;

    expect((await call('POST', `/api/sessions/${b}/merge`, { withId: other })).status).toBe(409); // different people
    expect((await call('POST', `/api/sessions/${b}/merge`, { withId: a })).body).toEqual({ ok: true, id: b });

    const board = await call('GET', '/api/board?from=2026-11-05T00:00:00%2B07:00&to=2026-11-06T00:00:00%2B07:00');
    expect(board.body.sessions.map((s: { id: number; start: string; end: string }) => [s.id, s.start, s.end])).toEqual([
      [b, '2026-11-05T07:00:00.000Z', '2026-11-05T11:00:00.000Z'],
      [other, '2026-11-05T11:00:00.000Z', '2026-11-05T12:00:00.000Z'],
    ]);
  });

  it('rejects bad input with 400', async () => {
    expect((await call('POST', '/api/sessions', { roomId: 'x' })).status).toBe(400);
    expect((await call('GET', '/api/board?from=2026-01-01T00:00:00Z&to=2026-06-01T00:00:00Z')).status).toBe(400);
  });
});
