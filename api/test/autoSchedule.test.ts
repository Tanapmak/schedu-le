import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { noWishes, resolveWishes, ruleCovers, solve, type RawWishes, type Slot, type SolverInput, type TimeRule } from '../src/autoSchedule.js';
import { parseCsv, scoreMap } from '../src/performance.js';
import { migrationsDir, seedDir } from '../src/paths.js';
import type { Rules } from '../src/rules/index.js';
import type { PersonRow } from '../src/store.js';
import { migrate, runSqlDir } from '../src/sqlFiles.js';

const at = (s: string) => new Date(`${s}:00+07:00`);
const rules: Rules = {
  kpiHours: { mc: 100, pd: 100 },
  maxHours: { mc: 200, pd: 200 },
  leaveQuotaPerDay: { mc: 2, pd: 2 },
  leaveMaxDaysPerMonth: { mc: 8, pd: 8 },
  sessionSlotMinutes: 120,
};
const person = (id: number, position: PersonRow['position'], extra: Partial<PersonRow> = {}): PersonRow => ({
  id,
  nickname: `P${id}`,
  position,
  employment: 'full_time',
  isActive: true,
  maxHours: null,
  kpiHours: null,
  ...extra,
});
let row = 0;
const slot = (roomId: number, from: string, to: string, needsPd = true): Slot => ({
  row: ++row,
  roomId,
  start: at(from),
  end: at(to),
  needsPd,
  location: 'studio',
  note: null,
  usual: {},
});
const base = (over: Partial<SolverInput>): SolverInput => ({
  slots: [],
  people: [],
  allowed: new Set(),
  rules,
  existing: [],
  leaves: [],
  holidays: [],
  maxDayHours: 8,
  wishes: noWishes,
  ...over,
});
const everyone = (people: PersonRow[]) => new Set(people.map((p) => p.id));

describe('AI scheduling solver', () => {
  it('keeps one crew on a room for a block, never double-books, and shares the next block', () => {
    const people = [person(1, 'mc'), person(2, 'mc'), person(3, 'pd'), person(4, 'pd')];
    const slots = [
      slot(1, '2030-01-07T10:00', '2030-01-07T12:00'),
      slot(1, '2030-01-07T12:00', '2030-01-07T14:00'),
      slot(2, '2030-01-07T10:00', '2030-01-07T12:00'),
    ];
    const plan = solve(base({ slots, people, allowed: everyone(people) }));
    expect(plan.every((a) => a.problems.length === 0)).toBe(true);
    // Room 1 keeps the same MC and PD for both slots; room 2 at 10:00 gets the other two.
    expect(plan[1].mc).toBe(plan[0].mc);
    expect(plan[1].pd).toBe(plan[0].pd);
    expect(new Set([plan[0].mc, plan[2].mc]).size).toBe(2);
    expect(new Set([plan[0].pd, plan[2].pd]).size).toBe(2);
  });

  it('respects leave, the daily cap and the monthly cap, and reports what it cannot fill', () => {
    const people = [person(1, 'mc', { maxHours: 4 }), person(2, 'mc'), person(3, 'pd')];
    const slots = [
      slot(1, '2030-01-07T10:00', '2030-01-07T12:00'),
      slot(1, '2030-01-07T12:00', '2030-01-07T14:00'),
      slot(1, '2030-01-07T14:00', '2030-01-07T16:00'),
      slot(1, '2030-01-07T16:00', '2030-01-07T18:00'),
      slot(1, '2030-01-07T18:00', '2030-01-07T20:00'),
    ];
    const leaves = [{ personId: 2, start: at('2030-01-07T00:00'), end: at('2030-01-08T00:00'), status: 'approved' }];
    const plan = solve(base({ slots, people, allowed: everyone(people), leaves, maxDayHours: 8 }));
    // P1 (cap 4h) takes two slots, P2 is on leave, the only PD is busy as PD: the rest stay open.
    expect(plan.map((a) => a.mc)).toEqual([1, 1, undefined, undefined, undefined]);
    expect(plan.slice(0, 2).map((a) => a.pd)).toEqual([3, 3]);
    expect(plan[2].problems).toEqual(['no_mc_free']);
  });

  it('stops a person at the daily cap', () => {
    const people = [person(1, 'mc'), person(2, 'mc')];
    const slots = [10, 12, 14, 16, 18].map((h) => slot(9, `2030-01-07T${h}:00`, `2030-01-07T${h + 2}:00`, false));
    const plan = solve(base({ slots, people, allowed: everyone(people), maxDayHours: 6 }));
    expect(plan.map((a) => a.mc)).toEqual([1, 1, 1, 2, 2]);
  });

  it('uses a PD as MC only when no MC is free, and fills PD first', () => {
    const people = [person(1, 'pd'), person(2, 'pd')];
    const plan = solve(base({ slots: [slot(1, '2030-01-07T10:00', '2030-01-07T12:00')], people, allowed: everyone(people) }));
    expect(plan[0].problems).toEqual([]);
    expect(new Set([plan[0].mc, plan[0].pd])).toEqual(new Set([1, 2]));
  });

  it('follows hard wishes and leans on soft ones', () => {
    const people = [person(1, 'mc'), person(2, 'mc'), person(3, 'pd'), person(4, 'pd')];
    const friNight = slot(1, '2030-01-11T22:00', '2030-01-12T00:00'); // Friday 22:00
    const noFriNight: TimeRule = { personId: 1, kind: 'avoid', strength: 'must', weekdays: [5], dates: [], from: '22:00', to: '02:00', roomIds: [], role: 'any' };
    const likesP4: TimeRule = { ...noFriNight, personId: 4, kind: 'prefer', strength: 'should' };
    const plan = solve(base({ slots: [friNight], people, allowed: everyone(people), wishes: { ...noWishes, rules: [noFriNight, likesP4] } }));
    expect(plan[0].mc).toBe(2);
    expect(plan[0].pd).toBe(4);
  });

  it('skips team off days and people the admin did not pick', () => {
    const people = [person(1, 'mc'), person(2, 'mc'), person(3, 'pd')];
    const slots = [slot(1, '2030-01-07T10:00', '2030-01-07T12:00'), slot(1, '2030-01-08T10:00', '2030-01-08T12:00')];
    const holidays = [{ start: at('2030-01-08T00:00'), end: at('2030-01-09T00:00') }];
    const plan = solve(base({ slots, people, allowed: new Set([2, 3]), holidays }));
    expect(plan[0].mc).toBe(2);
    expect(plan[1].problems).toEqual(['holiday']);
  });

  it('leans towards whoever sells better in that room and time of day', () => {
    const people = [person(1, 'mc', { nickname: 'Aom' }), person(2, 'mc', { nickname: 'Ponz' }), person(3, 'pd')];
    const evening = slot(1, '2030-01-07T19:00', '2030-01-07T21:00');
    const scores = scoreMap([
      { nickname: 'ponz', role: 'mc', roomCode: 'TTS 1', band: 'evening', ratio: 1.6, n: 20 },
      { nickname: 'ponz', role: 'mc', roomCode: 'TTS 1', band: null, ratio: 1.3, n: 30 },
    ]);
    const without = solve(base({ slots: [evening], people, allowed: everyone(people) }));
    expect(without[0].mc).toBe(1); // a tie goes to the lower id
    const withPerf = solve(base({ slots: [evening], people, allowed: everyone(people), performance: { scores, roomCode: new Map([[1, 'TTS 1']]) } }));
    expect(withPerf[0].mc).toBe(2);
  });

  it('reads CSV with quoted commas, quotes and line breaks', () => {
    expect(parseCsv('\uFEFFa,b,c\r\n1,"x, ""y"" z","line\nbreak"\n\n2,,\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, "y" z', 'line\nbreak'],
      ['2', '', ''],
    ]);
  });

  it('matches time windows that run past midnight, by live day', () => {
    const rule: TimeRule = { personId: 1, kind: 'avoid', strength: 'must', weekdays: [5], dates: [], from: '22:00', to: '02:00', roomIds: [], role: 'any' };
    expect(ruleCovers(rule, slot(1, '2030-01-12T00:00', '2030-01-12T02:00'), 'mc')).toBe(true); // Saturday 00:00 = Friday's live day
    expect(ruleCovers(rule, slot(1, '2030-01-11T18:00', '2030-01-11T20:00'), 'mc')).toBe(false);
    expect(ruleCovers(rule, slot(1, '2030-01-12T22:00', '2030-01-13T00:00'), 'mc')).toBe(false); // Saturday night
  });

  it('maps names and room codes loosely, and lists unknown names', () => {
    const raw: RawWishes = {
      rules: [{ person: 'new year', kind: 'avoid', strength: 'must', weekdays: ['fri'], dates: [], from: '22:00', to: '2:00', rooms: ['tts1'], role: 'any' }],
      hours: [{ person: 'Ghost', kind: 'more', hours: null }],
      pairs: [],
      summary: ['Newyear: no Friday nights'],
      not_understood: [],
    };
    const w = resolveWishes(raw, [person(7, 'mc', { nickname: 'Newyear' })], [{ id: 3, code: 'TTS 1' }]);
    expect(w.rules).toEqual([{ personId: 7, kind: 'avoid', strength: 'must', weekdays: [5], dates: [], from: '22:00', to: '02:00', roomIds: [3], role: 'any' }]);
    expect(w.hours).toEqual([]);
    expect(w.notUnderstood).toEqual(['Ghost']);
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('AI scheduling API', () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  let rooms: Record<string, number>;
  let asked: string[] = [];
  let prefsSeen: { nickname: string; month: string; text: string }[][] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 5 });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const client = await pool.connect();
    await migrate(client, migrationsDir);
    client.release();
    const readWishes = async ({ instructions, preferences }: { instructions: string; preferences: { nickname: string; month: string; text: string }[] }): Promise<RawWishes> => {
      asked.push(instructions);
      prefsSeen.push(preferences);
      return {
        rules: [{ person: 'mc a', kind: 'avoid', strength: 'must', weekdays: [], dates: ['2030-01-14'], from: null, to: null, rooms: [], role: 'any' }],
        hours: [],
        pairs: [],
        summary: ['MC A off on 14 Jan'],
        not_understood: [],
      };
    };
    server = createApp(pool, { mode: 'dev' }, { readScreenshot: undefined, readWishes }).listen(0);
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.close();
    await pool.end();
  });

  beforeEach(async () => {
    asked = [];
    prefsSeen = [];
    await pool.query('TRUNCATE preference_entries, performance_history');
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
    return { status: res.status, body: await res.json() };
  };

  it('plans from a pattern week with the wishes applied, then saves the plan as drafts', async () => {
    // Pattern: Monday 7 Jan, TTS 1 10:00-14:00 in two slots.
    for (const [from, to] of [
      ['10:00', '12:00'],
      ['12:00', '14:00'],
    ]) {
      await call('POST', '/api/sessions', {
        roomId: rooms['TTS 1'],
        start: `2030-01-07T${from}:00+07:00`,
        end: `2030-01-07T${to}:00+07:00`,
        staff: [
          { personId: 2, role: 'mc' },
          { personId: 4, role: 'pd' },
        ],
      });
    }
    const defaults = await call('GET', '/api/schedule/auto/defaults');
    expect(defaults.body.peopleIds).toEqual([2, 3, 4, 5]); // Boss is operation: left out by default
    expect(defaults.body.aiPlanner).toBe(true);
    expect(defaults.body.performanceLives).toBe(0);

    const req = { sourceFrom: '2030-01-07', targetFrom: '2030-01-14', targetTo: '2030-01-20', peopleIds: [2, 3, 4, 5], maxDayHours: 8, instructions: 'MC A ลาวันที่ 14' };
    const plan = await call('POST', '/api/schedule/auto', req);
    expect(plan.status).toBe(200);
    expect(asked).toEqual(['MC A ลาวันที่ 14']);
    expect(plan.body.aiUsed).toBe(true);
    expect(plan.body.wishes.summary).toEqual(['MC A off on 14 Jan']);
    expect(plan.body.rows).toHaveLength(2);
    expect(plan.body.rows.every((r: any) => r.ok)).toBe(true);
    // MC A is off on the 14th, so MC B hosts both slots; the PD stays the same for the block.
    expect(plan.body.rows.map((r: any) => r.staff.find((s: any) => s.role === 'mc').personId)).toEqual([3, 3]);
    const pds = plan.body.rows.map((r: any) => r.staff.find((s: any) => s.role === 'pd').personId);
    expect(pds[0]).toBe(pds[1]);
    expect(plan.body.people.find((p: any) => p.personId === 3).plannedHours).toBe(4);
    expect(Number((await pool.query('SELECT count(*) FROM sessions')).rows[0].count)).toBe(2); // nothing saved yet

    const sessions = plan.body.rows.map((r: any) => ({ roomId: r.roomId, start: r.start, end: r.end, staff: r.staff }));
    const saved = await call('POST', '/api/schedule/auto/save', { sessions });
    expect(saved.body.rows.every((r: any) => r.ok && r.id)).toBe(true);
    const { rows } = await pool.query(`SELECT status FROM sessions WHERE lower(period) >= '2030-01-14'`);
    expect(rows.map((r) => r.status)).toEqual(['draft', 'draft']);

    // Planning again: the room is now taken, so those slots are reported, not doubled.
    const again = await call('POST', '/api/schedule/auto', { ...req, instructions: '' });
    expect(asked).toHaveLength(1); // no instructions, no AI call
    expect(again.body.rows.every((r: any) => !r.ok && r.problems.includes('room_taken'))).toBe(true);
  });

  it('keeps each person\'s preference history, and uses the latest for each month', async () => {
    const send = (month: string, text: string, as = 'mc.a@example.com') => call('POST', '/api/preferences/me', { month, text }, as);
    expect((await call('GET', '/api/preferences/me', undefined, 'mc.a@example.com')).body).toEqual([]);
    expect((await send('2030-01', '  อยากได้กะเช้า  ')).status).toBe(201);
    expect((await send('2030-01', 'อยากได้กะเช้า ไม่เอาวันอาทิตย์')).status).toBe(201);
    expect((await send('2029-12', 'ธันวาขอชั่วโมงเยอะ')).status).toBe(201);
    // The person sees everything they sent, newest first.
    const mine = await call('GET', '/api/preferences/me', undefined, 'mc.a@example.com');
    expect(mine.body.map((e: any) => [e.month, e.text])).toEqual([
      ['2029-12', 'ธันวาขอชั่วโมงเยอะ'],
      ['2030-01', 'อยากได้กะเช้า ไม่เอาวันอาทิตย์'],
      ['2030-01', 'อยากได้กะเช้า'],
    ]);
    // Managers see only the latest per person per month.
    expect((await call('GET', '/api/preferences?month=2030-01', undefined, 'mc.a@example.com')).status).toBe(403);
    const jan = await call('GET', '/api/preferences?month=2030-01');
    expect(jan.body.map((p: any) => [p.nickname, p.text])).toEqual([['MC A', 'อยากได้กะเช้า ไม่เอาวันอาทิตย์']]);
    expect((await send('2030-13', 'x')).status).toBe(400);
    expect((await send('2030-01', '   ')).status).toBe(400);
    expect((await send('2030-01', 'x'.repeat(2001))).status).toBe(400);

    await call('POST', '/api/sessions', {
      roomId: rooms['TTS 1'],
      start: '2030-01-07T10:00:00+07:00',
      end: '2030-01-07T12:00:00+07:00',
      staff: [
        { personId: 2, role: 'mc' },
        { personId: 4, role: 'pd' },
      ],
    });
    const req = { sourceFrom: '2030-01-07', targetFrom: '2030-01-14', targetTo: '2030-01-20', peopleIds: [2, 3, 4, 5], maxDayHours: 8, instructions: '' };
    const plan = await call('POST', '/api/schedule/auto', req);
    expect(plan.body.aiUsed).toBe(true); // preferences alone are enough to ask the AI
    expect(plan.body.preferencesUsed).toBe(1);
    // Only January's latest entry: the plan is in January, December's wishes don't apply.
    expect(prefsSeen).toEqual([[{ nickname: 'MC A', month: '2030-01', text: 'อยากได้กะเช้า ไม่เอาวันอาทิตย์' }]]);
    // Unticked, or the person not picked: no AI call.
    await call('POST', '/api/schedule/auto', { ...req, usePreferences: false });
    await call('POST', '/api/schedule/auto', { ...req, peopleIds: [3, 4, 5] });
    expect(prefsSeen).toHaveLength(1);
  });

  it('loads the history sheet and uses it to pick who sells best', async () => {
    // MC B sells twice as much as MC A in TTS 1 mornings, on many lives.
    const lines = ['account,date,start_time,end_time,duration_hours,mc_1,mc_2,pd_1,pd_2,session_gmv,session_orders,session_views,campaign_level,remark'];
    for (let d = 1; d <= 20; d++) {
      const day = `2029-12-${String(d).padStart(2, '0')}`;
      lines.push(`TTS 1,${day},09:00:00,11:00:00,2,MC A,,PD A,,10000,10,100,BAU,"ok, fine"`);
      lines.push(`TTS 1,${day},10:00:00,12:00:00,2,mc b,,PD B,,20000,20,200,BAU,`);
    }
    lines.push('TTS 1,bad-date,10:00:00,12:00:00,2,MC A,,PD A,,1,1,1,BAU,');
    lines.push('TTS 2,2029-12-02,10:00:00,12:00:00,2,MC A,,PD A,,-500,1,1,BAU,'); // negative GMV: kept, number dropped
    const loaded = await call('POST', '/api/performance/history', { csv: lines.join('\n') });
    expect(loaded.body).toEqual({ loaded: 41, skipped: 1 });
    expect((await call('POST', '/api/performance/history', { csv: 'foo,bar\n1,2' })).status).toBe(400);

    await call('POST', '/api/sessions', {
      roomId: rooms['TTS 1'],
      start: '2030-01-07T10:00:00+07:00',
      end: '2030-01-07T12:00:00+07:00',
      staff: [
        { personId: 2, role: 'mc' },
        { personId: 4, role: 'pd' },
      ],
    });
    const req = { sourceFrom: '2030-01-07', targetFrom: '2030-01-14', targetTo: '2030-01-14', peopleIds: [2, 3, 4, 5], maxDayHours: 8, instructions: '' };
    // The lookback is 12 months back from today, so move the history next to today first.
    await pool.query(`UPDATE performance_history SET started_at = started_at + (now() - '2029-12-25'::timestamptz)`);
    const mcOf = (body: any) => body.rows[0].staff.find((s: any) => s.role === 'mc').personId;
    const withPerf = await call('POST', '/api/schedule/auto', req);
    expect(withPerf.body.performanceLives).toBe(40);
    expect(mcOf(withPerf.body)).toBe(3); // MC B, though MC A is the usual host
    const without = await call('POST', '/api/schedule/auto', { ...req, usePerformance: false });
    expect(mcOf(without.body)).toBe(2);
  });

  it('refuses bad input and non-managers', async () => {
    const ok = { sourceFrom: '2030-01-07', targetFrom: '2030-01-14', targetTo: '2030-01-20', peopleIds: [2], maxDayHours: 8, instructions: '' };
    expect((await call('POST', '/api/schedule/auto', { ...ok, targetFrom: '2030-01-10' })).status).toBe(400);
    expect((await call('POST', '/api/schedule/auto', { ...ok, peopleIds: [] })).status).toBe(400);
    expect((await call('POST', '/api/schedule/auto', { ...ok, maxDayHours: 30 })).status).toBe(400);
    expect((await call('POST', '/api/schedule/auto', ok, 'mc.a@example.com')).status).toBe(403);
    expect((await call('POST', '/api/schedule/auto/save', { sessions: [] })).status).toBe(400);
  });
});
