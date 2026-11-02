import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import ExcelJS from 'exceljs';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { migrationsDir, seedDir } from '../src/paths.js';
import { migrate, runSqlDir } from '../src/sqlFiles.js';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('copy and import drafts', () => {
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
    server = createApp(pool, { mode: 'dev' }, { readScreenshot: undefined }).listen(0);
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE session_staff, sessions, leave_requests, holidays, people RESTART IDENTITY CASCADE');
    await runSqlDir(pool, seedDir);
    await pool.query(`INSERT INTO people (nickname, position, email, app_role) VALUES
      ('Boss', 'operation', 'boss@example.com', 'admin'), ('MC A', 'mc', 'mc.a@example.com', 'mc'), ('MC B', 'mc', NULL, 'mc'),
      ('PD A', 'pd', NULL, 'pd'), ('PD B', 'pd', NULL, 'pd')`);
    const { rows } = await pool.query('SELECT id::int, code FROM rooms');
    rooms = Object.fromEntries(rows.map((r) => [r.code, r.id]));
  });

  const call = async (method: string, path: string, body?: unknown, as = 'boss@example.com') => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-dev-user': as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
  };

  const session = (room: string, from: string, to: string, mc: number, pd: number) =>
    call('POST', '/api/sessions', {
      roomId: rooms[room],
      start: `${from}:00+07:00`,
      end: `${to}:00+07:00`,
      staff: [
        { personId: mc, role: 'mc' },
        { personId: pd, role: 'pd' },
      ],
    });

  const count = async () => Number((await pool.query(`SELECT count(*) FROM sessions`)).rows[0].count);

  it('copies a week onto the next two by weekday, keeps overnight lives, skips clashes', async () => {
    // Week of Mon 7 Jan 2030: Monday morning, and a Tuesday night that runs past midnight.
    await session('TTS 1', '2030-01-07T10:00', '2030-01-07T12:00', 2, 4);
    await session('TTS 2', '2030-01-08T22:00', '2030-01-09T02:00', 3, 5);
    // MC A is on leave Monday 21st: that copy must be skipped.
    await pool.query(`INSERT INTO leave_requests (person_id, period, status) VALUES (2, tstzrange('2030-01-21 00:00+07', '2030-01-22 00:00+07'), 'approved')`);

    const range = { sourceFrom: '2030-01-07', sourceTo: '2030-01-13', targetFrom: '2030-01-14', targetTo: '2030-01-27' };
    const preview = await call('POST', '/api/sessions/copy', range);
    expect(preview.status).toBe(200);
    expect(preview.body.rows).toHaveLength(4);
    expect(preview.body.rows.filter((r: any) => r.ok)).toHaveLength(3);
    expect(preview.body.rows.find((r: any) => !r.ok).violations.map((v: any) => v.code)).toContain('on_leave');
    expect(await count()).toBe(2); // a preview saves nothing

    const done = await call('POST', '/api/sessions/copy', { ...range, dryRun: false });
    expect(done.body.rows.filter((r: any) => r.id)).toHaveLength(3);
    const { rows } = await pool.query(`SELECT lower(period) AS s, upper(period) AS e, status FROM sessions WHERE room_id = $1 ORDER BY 1`, [rooms['TTS 2']]);
    expect(rows.map((r) => [new Date(r.s).toISOString(), new Date(r.e).toISOString(), r.status])).toEqual([
      ['2030-01-08T15:00:00.000Z', '2030-01-08T19:00:00.000Z', 'draft'],
      ['2030-01-15T15:00:00.000Z', '2030-01-15T19:00:00.000Z', 'draft'],
      ['2030-01-22T15:00:00.000Z', '2030-01-22T19:00:00.000Z', 'draft'],
    ]);

    // Copying again: everything is already there, so every row clashes and nothing is added.
    const again = await call('POST', '/api/sessions/copy', { ...range, dryRun: false });
    expect(again.body.rows.every((r: any) => !r.ok)).toBe(true);
    expect(await count()).toBe(5);
  });

  it('refuses overlapping or oversized ranges, and non-managers', async () => {
    const ok = { sourceFrom: '2030-01-07', sourceTo: '2030-01-13', targetFrom: '2030-01-14', targetTo: '2030-01-20' };
    expect((await call('POST', '/api/sessions/copy', { ...ok, targetFrom: '2030-01-10' })).status).toBe(400);
    expect((await call('POST', '/api/sessions/copy', { ...ok, targetTo: '2030-06-01' })).status).toBe(400);
    expect((await call('POST', '/api/sessions/copy', ok, 'mc.a@example.com')).status).toBe(403);
  });

  it('imports a sheet: checks every row first, then saves the good ones as drafts', async () => {
    const template = await call('GET', '/api/sessions/import-template');
    expect(template.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(template.body as ArrayBuffer);
    const ws = wb.worksheets[0];
    ws.spliceRows(2, 1); // drop the example row
    ws.addRow(['2030-02-04', 'TTS 1', '10:00', '12:00', 'MC A', 'PD A', '']);
    ws.addRow(['04/02/2030', 'tts1', '12:00', '14:00', 'mc b', 'PD B', 'DD/MM and loose spelling']);
    ws.addRow(['2030-02-04', 'TTS 9', '10:00', '12:00', 'MC A', 'PD A', '']); // unknown room
    ws.addRow(['2030-02-04', 'TTS 2', '10:00', '12:00', 'Nobody', 'PD B', '']); // unknown MC
    ws.addRow(['2030-02-04', 'TTS 2', '11:00', '13:00', 'MC A', 'PD B', '']); // MC A already in TTS 1 at 11:00
    ws.addRow(['2030-02-04', 'TTS 3', '22:00', '01:00', 'MC B', 'PD A', '']); // overnight
    const data = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');

    const preview = await call('POST', '/api/sessions/import', { filename: 'plan.xlsx', data });
    expect(preview.status).toBe(200);
    const byRow = Object.fromEntries(preview.body.rows.map((r: any) => [r.row, r]));
    expect(byRow[2].ok && byRow[3].ok && byRow[7].ok).toBe(true);
    expect(byRow[4].problems).toEqual(['unknown_room']);
    expect(byRow[5].problems).toEqual(['unknown_mc']);
    expect(byRow[6].violations.map((v: any) => v.code)).toContain('person_busy');
    expect(byRow[7].end).toBe('2030-02-04T18:00:00.000Z');
    expect(await count()).toBe(0);

    const saved = await call('POST', '/api/sessions/import', { filename: 'plan.xlsx', data, dryRun: false });
    expect(saved.body.rows.filter((r: any) => r.id)).toHaveLength(3);
    expect(await count()).toBe(3);
  });

  it('reads a CSV too, and rejects other files', async () => {
    const csv = '﻿date,room,start,end,mc,pd,note\n2030-03-04,SHP 1,14:00,17:00,MC B,PD B,"hello, world"\n\n';
    const res = await call('POST', '/api/sessions/import', { filename: 'plan.csv', data: Buffer.from(csv).toString('base64'), dryRun: false });
    expect(res.body.rows).toMatchObject([{ row: 2, ok: true }]);
    expect((await pool.query(`SELECT note FROM sessions`)).rows[0].note).toBe('hello, world');
    expect((await call('POST', '/api/sessions/import', { filename: 'plan.pdf', data: 'x' })).status).toBe(400);
  });
});
