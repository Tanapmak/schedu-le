import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { migrationsDir, seedDir } from '../src/paths.js';
import { migrate, runSqlDir } from '../src/sqlFiles.js';

// Needs a throwaway Postgres: this test drops and recreates the public schema.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('content shoots', () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  let room: number;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 5 });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const client = await pool.connect();
    await migrate(client, migrationsDir);
    client.release();
    server = createApp(pool, { mode: 'dev' }, {}).listen(0);
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.close();
    await pool.end();
  });

  // 1 MC A (mc), 2 PD A (pd), 3 Boss (admin), 4 Video (video), 5 MC B (mc)
  beforeEach(async () => {
    await pool.query('TRUNCATE content_shoot_people, content_shoots, session_staff, sessions, leave_requests, holidays, people RESTART IDENTITY CASCADE');
    await runSqlDir(pool, seedDir);
    await pool.query(`INSERT INTO people (nickname, position, email, app_role) VALUES
      ('MC A', 'mc', 'mc.a@example.com', 'mc'), ('PD A', 'pd', 'pd.a@example.com', 'pd'),
      ('Boss', 'operation', 'boss@example.com', 'admin'), ('Video', 'operation', 'video@example.com', 'video'),
      ('MC B', 'mc', 'mc.b@example.com', 'mc')`);
    room = (await pool.query(`SELECT id::int FROM rooms WHERE code = 'TTS 1'`)).rows[0].id;
  });

  const call = async (method: string, path: string, body?: unknown, as = 'video@example.com') => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-dev-user': as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const at = (t: string) => `2026-11-20T${t}:00+07:00`;
  const shoot = (from: string, to: string, personIds = [1]) => ({ title: 'Reels TV 55"', start: at(from), end: at(to), personIds, location: 'Studio B' });
  const live = async (from: string, to: string, status: 'draft' | 'published' = 'published') => {
    const out = await call('POST', '/api/sessions', { roomId: room, start: at(from), end: at(to), staff: [{ personId: 1, role: 'mc' }, { personId: 2, role: 'pd' }] }, 'boss@example.com');
    expect(out.status).toBe(201);
    if (status === 'published') await pool.query(`UPDATE sessions SET status = 'published' WHERE id = $1`, [out.body.id]);
    return out.body.id as number;
  };

  it('books a shoot and lists it for the person', async () => {
    const saved = await call('POST', '/api/shoots', shoot('10:00', '12:00', [1, 2]));
    expect(saved.status).toBe(201);
    const range = `from=${encodeURIComponent(at('00:00'))}&to=${encodeURIComponent(at('23:00'))}`;
    const all = await call('GET', `/api/shoots?${range}`);
    expect(all.body).toHaveLength(1);
    expect(all.body[0]).toMatchObject({ title: 'Reels TV 55"', personIds: [1, 2], location: 'Studio B', createdBy: 'Video' });
    // MC/PD only get their own shoots.
    expect((await call('GET', `/api/shoots?${range}`, undefined, 'mc.a@example.com')).body).toHaveLength(1);
    expect((await call('GET', `/api/shoots?${range}`, undefined, 'mc.b@example.com')).body).toHaveLength(0);
  });

  it('only video, operation and admin can plan shoots', async () => {
    expect((await call('POST', '/api/shoots', shoot('10:00', '12:00'), 'mc.a@example.com')).status).toBe(403);
    expect((await call('POST', '/api/shoots', shoot('10:00', '12:00'), 'boss@example.com')).status).toBe(201);
  });

  it('blocks a shoot over the person’s published live', async () => {
    await live('11:00', '13:00');
    const out = await call('POST', '/api/shoots', shoot('10:00', '12:00'));
    expect(out.status).toBe(422);
    expect(out.body.violations[0]).toMatchObject({ code: 'shoot_live_clash', severity: 'error', personId: 1 });
    // Back to back is fine.
    expect((await call('POST', '/api/shoots', shoot('09:00', '11:00'))).status).toBe(201);
  });

  it('warns about a draft live, saves after confirm', async () => {
    await live('11:00', '13:00', 'draft');
    const out = await call('POST', '/api/shoots', shoot('10:00', '12:00'));
    expect(out.status).toBe(409);
    expect(out.body.violations[0]).toMatchObject({ code: 'shoot_draft_clash', severity: 'warning' });
    expect((await call('POST', '/api/shoots', { ...shoot('10:00', '12:00'), confirm: true })).status).toBe(201);
  });

  it('blocks two shoots for one person at once and moves keep the rules', async () => {
    const a = (await call('POST', '/api/shoots', shoot('10:00', '12:00'))).body.id;
    const b = await call('POST', '/api/shoots', shoot('11:00', '13:00', [1, 5]));
    expect(b.status).toBe(422);
    expect(b.body.violations.map((v: { code: string }) => v.code)).toEqual(['shoot_overlap']);
    // Moving the shoot onto a live is refused; moving it somewhere free works.
    await live('14:00', '16:00');
    expect((await call('PUT', `/api/shoots/${a}`, shoot('15:00', '17:00'))).status).toBe(422);
    expect((await call('PUT', `/api/shoots/${a}`, shoot('17:00', '19:00', [5]))).status).toBe(200);
    expect((await call('DELETE', `/api/shoots/${a}`)).body.ok).toBe(true);
  });

  it('approved leave blocks, pending leave warns', async () => {
    await pool.query(`INSERT INTO leave_requests (person_id, period, status) VALUES (1, tstzrange($1, $2), 'approved'), (5, tstzrange($1, $2), 'pending')`, [at('00:00'), at('23:00')]);
    expect((await call('POST', '/api/shoots/check', shoot('10:00', '12:00', [1]))).body.violations[0].code).toBe('shoot_on_leave');
    expect((await call('POST', '/api/shoots/check', shoot('10:00', '12:00', [5]))).body.violations[0]).toMatchObject({ code: 'shoot_leave_pending', severity: 'warning' });
  });

  it('a live scheduled over a shoot gets a warning', async () => {
    await call('POST', '/api/shoots', shoot('10:00', '12:00'));
    const out = await call('POST', '/api/sessions', { roomId: room, start: at('11:00'), end: at('13:00'), staff: [{ personId: 1, role: 'mc' }, { personId: 2, role: 'pd' }] }, 'boss@example.com');
    expect(out.status).toBe(409);
    expect(out.body.violations.map((v: { code: string }) => v.code)).toContain('live_shoot_clash');
  });
});
