import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrationsDir, seedDir } from '../src/paths.js';
import { loadRules } from '../src/rules/index.js';
import { migrate, runSqlDir } from '../src/sqlFiles.js';

// Needs a throwaway Postgres: this test drops and recreates the public schema.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('database schema', () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url });
    await client.connect();
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(client, migrationsDir);
    await runSqlDir(client, seedDir);
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    // CASCADE also empties rules and audit_log (they reference people), so reseed.
    await client.query('TRUNCATE session_staff, sessions, leave_requests, people RESTART IDENTITY CASCADE');
    await runSqlDir(client, seedDir);
    await client.query(`INSERT INTO people (nickname, position) VALUES ('MC A', 'mc'), ('PD A', 'pd'), ('PD B', 'pd')`);
  });

  const room = async (code: string) =>
    (await client.query<{ id: string }>('SELECT id FROM rooms WHERE code = $1', [code])).rows[0].id;

  const addSession = async (code: string, from: string, to: string, status = 'published') =>
    (
      await client.query<{ id: string }>(
        `INSERT INTO sessions (room_id, period, status, cancel_reason)
         VALUES ($1, tstzrange($2, $3), $4::session_status, CASE WHEN $4::session_status = 'cancelled' THEN 'test' END) RETURNING id`,
        [await room(code), from, to, status],
      )
    ).rows[0].id;

  const staff = (sessionId: string, personId: number, role: 'mc' | 'pd') =>
    client.query('INSERT INTO session_staff (session_id, person_id, role) VALUES ($1, $2, $3)', [sessionId, personId, role]);

  it('is idempotent: running migrations again applies nothing', async () => {
    expect(await migrate(client, migrationsDir)).toEqual([]);
  });

  it('seeds all eight store accounts', async () => {
    const { rows } = await client.query('SELECT code FROM rooms ORDER BY code');
    expect(rows.map((r) => r.code)).toEqual(['LZD 1', 'LZD 2', 'SHP 1', 'SHP 2', 'SHP 3', 'TTS 1', 'TTS 2', 'TTS 3']);
  });

  it('rejects two sessions in the same room at overlapping times', async () => {
    await addSession('TTS 1', '2026-11-05 10:00+07', '2026-11-05 12:00+07');
    await expect(addSession('TTS 1', '2026-11-05 11:00+07', '2026-11-05 13:00+07')).rejects.toThrow(
      /sessions_room_no_overlap/,
    );
  });

  it('allows back-to-back sessions and the same time in another room', async () => {
    await addSession('TTS 1', '2026-11-05 10:00+07', '2026-11-05 12:00+07');
    await addSession('TTS 1', '2026-11-05 12:00+07', '2026-11-05 14:00+07');
    await addSession('SHP 1', '2026-11-05 10:00+07', '2026-11-05 12:00+07');
  });

  it('frees the room when a session is cancelled', async () => {
    await addSession('TTS 1', '2026-11-05 10:00+07', '2026-11-05 12:00+07', 'cancelled');
    await addSession('TTS 1', '2026-11-05 10:00+07', '2026-11-05 12:00+07');
  });

  it('rejects one person in two overlapping sessions', async () => {
    const a = await addSession('TTS 1', '2026-11-05 10:00+07', '2026-11-05 12:00+07');
    const b = await addSession('SHP 1', '2026-11-05 11:00+07', '2026-11-05 13:00+07');
    await staff(a, 2, 'pd');
    await expect(staff(b, 2, 'pd')).rejects.toThrow(/session_staff_person_no_overlap/);
    await staff(b, 3, 'pd');
  });

  it('lets a PD host as MC (role is per session, not per person)', async () => {
    const a = await addSession('TTS 1', '2026-11-05 10:00+07', '2026-11-05 12:00+07');
    await staff(a, 2, 'mc');
    const { rows } = await client.query('SELECT role FROM session_staff WHERE session_id = $1', [a]);
    expect(rows[0].role).toBe('mc');
  });

  it('moves staff with their session and catches the new clash', async () => {
    const a = await addSession('TTS 1', '2026-11-05 10:00+07', '2026-11-05 12:00+07');
    const b = await addSession('SHP 1', '2026-11-05 14:00+07', '2026-11-05 16:00+07');
    await staff(a, 2, 'pd');
    await staff(b, 2, 'pd');
    await expect(
      client.query(`UPDATE sessions SET period = tstzrange('2026-11-05 11:00+07', '2026-11-05 13:00+07') WHERE id = $1`, [b]),
    ).rejects.toThrow(/session_staff_person_no_overlap/);
  });

  it('frees a person once their session is cancelled or they are replaced', async () => {
    const a = await addSession('TTS 1', '2026-11-05 10:00+07', '2026-11-05 12:00+07');
    const b = await addSession('SHP 1', '2026-11-05 10:00+07', '2026-11-05 12:00+07');
    const c = await addSession('LZD 1', '2026-11-05 10:00+07', '2026-11-05 12:00+07');
    await staff(a, 2, 'pd');
    await client.query(`UPDATE sessions SET status = 'cancelled', cancel_reason = 'team meeting' WHERE id = $1`, [a]);
    await staff(b, 2, 'pd');
    await client.query('UPDATE session_staff SET replaced = true WHERE session_id = $1 AND person_id = 2', [b]);
    await staff(c, 2, 'pd');
  });

  it('requires a reason to cancel', async () => {
    const a = await addSession('TTS 1', '2026-11-05 10:00+07', '2026-11-05 12:00+07');
    await expect(client.query(`UPDATE sessions SET status = 'cancelled' WHERE id = $1`, [a])).rejects.toThrow(
      /check/,
    );
  });

  it('rejects overlapping live leave requests for one person', async () => {
    const leave = (from: string, to: string) =>
      client.query(`INSERT INTO leave_requests (person_id, period) VALUES (1, tstzrange($1, $2))`, [from, to]);
    await leave('2026-11-09 00:00+07', '2026-11-10 00:00+07');
    await expect(leave('2026-11-09 12:00+07', '2026-11-11 00:00+07')).rejects.toThrow(/leave_no_overlap/);
  });

  it('exports published sessions with each person and their role', async () => {
    const a = await addSession('TTS 2', '2026-11-05 19:00+07', '2026-11-05 21:00+07');
    await staff(a, 1, 'mc');
    await staff(a, 3, 'pd');
    await addSession('TTS 2', '2026-11-05 21:00+07', '2026-11-05 23:00+07', 'draft');
    const { rows } = await client.query('SELECT account, date::text AS date, scheduled_hours, person, role_in_session FROM export_sessions ORDER BY person');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ account: 'TTS 2', person: 'MC A', role_in_session: 'mc' });
    expect(Number(rows[0].scheduled_hours)).toBe(2);
    expect(rows[0].date).toBe('2026-11-05');
  });

  it('loads the seeded rules', async () => {
    expect(await loadRules(client)).toEqual({
      kpiHours: { mc: 96, pd: 132 },
      maxHours: { mc: 124, pd: 176 },
      leaveQuotaPerDay: { mc: 2, pd: 2 },
      sessionSlotMinutes: 120,
    });
  });
});
