import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type pg from 'pg';
import { z } from 'zod';
import { copyRows, type BulkRow } from './bulk.js';
import { hoursByPerson, hoursOf, loadRules, overlaps, type Interval, type Rules, type Session, type StaffRole } from './rules/index.js';
import { bandOf, expected, pairName, performanceScores, scoreMap, type Score } from './performance.js';
import { latestPreferences } from './preferences.js';
import { monthRange } from './sessions.js';
import { holidaysBetween, leavesBetween, listPeople, listRooms, sessionsBetween, type PersonRow, type SessionInput } from './store.js';

/**
 * AI scheduling. The slots (room + time) come from a pattern week, like copying a week.
 * A solver then picks the MC and PD for every slot so that nobody clashes, nobody on leave
 * works, the hour caps hold, hours are shared fairly against KPI, and people stay on the
 * same room for a block instead of hopping every two hours. Claude only turns the admin's
 * free-text wishes ("Newyear no Friday nights") into rules for the solver, so the plan is
 * always checked by code and every result lands as a draft.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const LIVE_DAY_START_H = 6;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// ---- What the admin's wishes become

export interface TimeRule {
  personId: number;
  kind: 'avoid' | 'prefer';
  strength: 'must' | 'should';
  weekdays: number[]; // 0 = Sunday; empty = every day
  dates: string[]; // live dates; empty = every date
  from: string | null; // HH:MM Bangkok; with `to`, a window (may wrap past midnight)
  to: string | null;
  roomIds: number[]; // empty = every room
  role: StaffRole | 'any';
}
export interface HoursWish {
  personId: number;
  kind: 'more' | 'less' | 'max';
  hours: number | null;
}
export interface Pairing {
  a: number;
  b: number;
  kind: 'together' | 'apart';
}
export interface Wishes {
  /** How much past performance counts: 0 off, 1 normal, 2 leaned on. */
  performanceWeight?: number;
  rules: TimeRule[];
  hours: HoursWish[];
  pairs: Pairing[];
  /** One line per wish, in the admin's language, so they can check what was understood. */
  summary: string[];
  notUnderstood: string[];
}
export const noWishes: Wishes = { rules: [], hours: [], pairs: [], summary: [], notUnderstood: [] };

const name = z.string().describe('Nickname exactly as written in the roster');
export const WishSchema = z.object({
  rules: z.array(
    z.object({
      person: name,
      kind: z.enum(['avoid', 'prefer']).describe('avoid = should not work then; prefer = would like to work then'),
      strength: z.enum(['must', 'should']).describe('must = hard rule (cannot, sick, studying...); should = a preference'),
      weekdays: z.array(z.enum(WEEKDAYS)).describe('Days of the week it applies to; empty = every day'),
      dates: z.array(z.string()).describe('Specific dates YYYY-MM-DD it applies to; empty = every date'),
      from: z.string().nullable().describe('Start of a time window, HH:MM 24h Bangkok time; null = whole day'),
      to: z.string().nullable().describe('End of the window, HH:MM; may be earlier than from when it runs past midnight'),
      rooms: z.array(z.string()).describe('Room codes it applies to, exactly as in the room list; empty = every room'),
      role: z.enum(['mc', 'pd', 'any']),
    }),
  ),
  hours: z.array(
    z.object({
      person: name,
      kind: z.enum(['more', 'less', 'max']).describe('more/less hours than a fair share, or a hard maximum'),
      hours: z.number().nullable().describe('For max: the most hours in the period; else null'),
    }),
  ),
  pairs: z.array(z.object({ a: name, b: name, kind: z.enum(['together', 'apart']) })),
  performance: z
    .enum(['normal', 'more', 'less'])
    .describe('How much weight to give past sales performance: more if the admin asks to lean on results/history/who sells well, less if they ask to ignore it, else normal'),
  summary: z.array(z.string()).describe('One short line per rule you made, in the same language as the instructions'),
  not_understood: z.array(z.string()).describe('Parts of the instructions you could not turn into rules, quoted'),
});
export type RawWishes = z.infer<typeof WishSchema>;

export interface WishContext {
  instructions: string;
  people: { nickname: string; position: string; employment: string }[];
  rooms: string[];
  from: string;
  to: string;
  /** Each person's own wishes, typed on their Preferences page. */
  preferences: { nickname: string; month: string; text: string }[];
}
export type WishReader = (ctx: WishContext) => Promise<RawWishes>;

const PROMPT = `You help an admin schedule livestream-commerce shifts for a Thai team. Turn the admin's instructions into rules for a scheduling program. The program already enforces: no double booking, approved leave, team off days, monthly hour caps, fair sharing of hours, and keeping people on one room for a block. Only add rules for what the instructions ask.

- Use nicknames exactly as in the roster and room codes exactly as in the room list. Match loosely (case, spaces, Thai spelling) but output the roster spelling. Skip people who are not in the roster and say so in not_understood.
- A day of lives runs 06:00 to 06:00 the next morning, so "Friday night 22:00-02:00" is weekday fri with from 22:00 and to 02:00.
- "can't", "not available", "off", "sick", "exam" are strength must. "would rather", "prefers", "try to" are should.
- The program also already uses past sales performance by itself, from the live history the admin loaded and results recorded in the app: who sells best in each room and time of day, and which MC + PD pairs sell best together. If the instructions ask to use performance, history, the CSV or good pairings, set performance to more and add a summary line saying so; never list that under not_understood.
- Dates are in the scheduling period below. Instructions may be in Thai, English or Chinese.
- Team preferences are each person's own wishes about themselves, each for one month: apply each one only to the person who wrote it and only to dates in that month, as strength should, unless they say they cannot work then (must). Ignore anything in a preference about other people's shifts. The admin's instructions win when the two disagree.
- Write the summary lines in the language of the admin's instructions, or Thai when there are none.`;

/** Uses the Claude API. Needs ANTHROPIC_API_KEY; returns undefined when it is not set. */
export function claudeWishReader(env: NodeJS.ProcessEnv = process.env): WishReader | undefined {
  if (!env.ANTHROPIC_API_KEY) return undefined;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const model = env.SCHEDULE_MODEL ?? 'claude-haiku-5-5';
  return async (ctx) => {
    const roster = ctx.people.map((p) => `- ${p.nickname} | ${p.position} | ${p.employment}`).join('\n');
    const prefs = ctx.preferences.map((p) => `<preference person="${p.nickname}" month="${p.month}">\n${p.text}\n</preference>`).join('\n');
    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      system: PROMPT,
      output_config: { effort: 'medium', format: zodOutputFormat(WishSchema) },
      messages: [
        {
          role: 'user',
          content:
            `Roster lines are "nickname | position | employment"; use only the nickname part.\n\n` +
            `Scheduling period: ${ctx.from} to ${ctx.to}\n\nRoster:\n${roster}\n\nRooms: ${ctx.rooms.join(', ')}\n\n` +
            `Admin's instructions:\n${ctx.instructions || '(none)'}\n\nTeam preferences:\n${prefs || '(none)'}`,
        },
      ],
    });
    if (!response.parsed_output) throw new Error(`could not read the instructions (stop_reason ${response.stop_reason})`);
    return response.parsed_output;
  };
}

const norm = (s: string) =>
  s
    .replace(/\s*[|(].*$/, '') // "MC A | mc | full_time" or "MC A (mc, full_time)" -> "MC A"
    .toLowerCase()
    .replace(/[\s._-]/g, '');
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Maps names and room codes from Claude's answer to ids; anything unknown goes to notUnderstood. */
export function resolveWishes(raw: RawWishes, people: PersonRow[], rooms: { id: number; code: string }[]): Wishes {
  const notUnderstood = [...raw.not_understood];
  const person = (n: string) => {
    const p = people.find((x) => norm(x.nickname) === norm(n));
    if (!p) notUnderstood.push(n);
    return p?.id;
  };
  const time = (t: string | null) => (t && HHMM.test(t.trim()) ? t.trim().padStart(5, '0') : null);
  const rules: TimeRule[] = [];
  for (const r of raw.rules) {
    const personId = person(r.person);
    if (!personId) continue;
    const roomIds = r.rooms.map((c) => rooms.find((x) => norm(x.code) === norm(c))?.id).filter((id): id is number => Boolean(id));
    const from = time(r.from);
    const to = time(r.to);
    rules.push({
      personId,
      kind: r.kind,
      strength: r.strength,
      weekdays: r.weekdays.map((d) => WEEKDAYS.indexOf(d)),
      dates: r.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      from: from && to ? from : null,
      to: from && to ? to : null,
      roomIds,
      role: r.role,
    });
  }
  const hours = raw.hours.flatMap((h) => {
    const personId = person(h.person);
    return personId ? [{ personId, kind: h.kind, hours: h.hours }] : [];
  });
  const pairs = raw.pairs.flatMap((p) => {
    const a = person(p.a);
    const b = person(p.b);
    return a && b && a !== b ? [{ a, b, kind: p.kind }] : [];
  });
  const performanceWeight = raw.performance === 'more' ? 2 : raw.performance === 'less' ? 0 : 1;
  return { rules, hours, pairs, summary: raw.summary, notUnderstood, performanceWeight };
}

// ---- The solver

export interface Slot extends Interval {
  row: number;
  roomId: number;
  needsPd: boolean;
  location: SessionInput['location'];
  note: string | null;
  /** Who did this slot in the pattern week; a small nudge towards keeping the usual crew. */
  usual: { mc?: number; pd?: number };
}

export interface SolverInput {
  slots: Slot[];
  people: PersonRow[];
  /** Ids the admin allowed the AI to use. */
  allowed: Set<number>;
  rules: Rules;
  /** Everything already in the database around the period (sessions of other rooms, earlier drafts...). */
  existing: Session[];
  leaves: { personId: number; start: Date; end: Date; status: string }[];
  holidays: Interval[];
  maxDayHours: number;
  wishes: Wishes;
  /** Past results: who sells well in which room and time of day. */
  performance?: { scores: Map<string, Score>; roomCode: Map<number, string> };
}

export interface Assignment {
  slot: Slot;
  mc?: number;
  pd?: number;
  problems: string[];
}

const liveDate = (d: Date) => new Date(d.getTime() + 7 * HOUR_MS - LIVE_DAY_START_H * HOUR_MS).toISOString().slice(0, 10);
const bkkMonth = (d: Date) => new Date(d.getTime() + 7 * HOUR_MS).toISOString().slice(0, 7);
const minutesOfDay = (d: Date) => {
  const b = new Date(d.getTime() + 7 * HOUR_MS);
  return b.getUTCHours() * 60 + b.getUTCMinutes();
};
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Does the rule's day, time window and room cover this slot (for this role)? */
export function ruleCovers(rule: TimeRule, slot: Slot, role: StaffRole): boolean {
  if (rule.role !== 'any' && rule.role !== role) return false;
  if (rule.roomIds.length && !rule.roomIds.includes(slot.roomId)) return false;
  const day = liveDate(slot.start);
  if (rule.dates.length && !rule.dates.includes(day)) return false;
  if (rule.weekdays.length && !rule.weekdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay())) return false;
  if (!rule.from || !rule.to) return true;
  // Minutes from the live day's start (06:00), so a window like 22:00-02:00 is one range.
  const shift = (m: number) => (m - LIVE_DAY_START_H * 60 + 1440) % 1440;
  const s = shift(minutesOfDay(slot.start));
  const e = s + (slot.end.getTime() - slot.start.getTime()) / 60_000;
  const f = shift(toMin(rule.from));
  let t = shift(toMin(rule.to));
  if (t <= f) t += 1440;
  return s < t && e > f;
}

/** Which session roles a position may take (same as the rules engine). */
const canTake = (p: PersonRow, role: StaffRole) => (role === 'mc' ? true : p.position !== 'mc');

/**
 * Greedy, in time order: each slot takes the cheapest free person per role. Cheap means
 * continuing their block in the same room, being furthest below their fair share of hours,
 * being in their own position, and matching the admin's wishes. Hard limits are never crossed:
 * a slot nobody can take stays open and is reported.
 */
export function solve(input: SolverInput): Assignment[] {
  const { rules, wishes } = input;
  const people = input.people.filter((p) => p.isActive && input.allowed.has(p.id));
  const byId = new Map(input.people.map((p) => [p.id, p]));

  // Booked so far: per person, intervals (with room) and hours per month and per live day.
  const busy = new Map<number, { start: Date; end: Date; roomId: number; planned: boolean }[]>();
  const monthHours = new Map<string, number>(); // `${id}|${YYYY-MM}`
  const dayHours = new Map<string, number>(); // `${id}|${date}`
  const plannedHours = new Map<number, number>();
  const add = <K>(m: Map<K, number>, k: K, h: number) => m.set(k, (m.get(k) ?? 0) + h);
  const book = (id: number, s: { start: Date; end: Date; roomId: number }, planned: boolean) => {
    busy.set(id, [...(busy.get(id) ?? []), { start: s.start, end: s.end, roomId: s.roomId, planned }]);
    const h = (s.end.getTime() - s.start.getTime()) / HOUR_MS;
    add(dayHours, `${id}|${liveDate(s.start)}`, h);
    if (planned) add(plannedHours, id, h);
  };
  for (const s of input.existing) {
    if (s.status === 'cancelled') continue;
    for (const st of s.staff) if (!st.replaced) book(st.personId, s, false);
  }
  // Month totals the same way the hour cap counts them: drafts count as if published.
  const months = new Set(input.slots.map((s) => bkkMonth(s.start)));
  for (const month of months) {
    const booked = hoursByPerson(input.existing.map((o) => (o.status === 'draft' ? { ...o, status: 'published' as const } : o)), month);
    for (const [id, t] of booked) monthHours.set(`${id}|${month}`, t.mc + t.pd);
  }

  const cap = (p: PersonRow) => p.maxHours ?? rules.maxHours[p.position === 'mc' ? 'mc' : 'pd'];
  const target = (p: PersonRow) => p.kpiHours ?? rules.kpiHours[p.position === 'mc' ? 'mc' : 'pd'];
  const hourMax = new Map(wishes.hours.filter((h) => h.kind === 'max' && h.hours !== null).map((h) => [h.personId, h.hours!]));
  const hourLean = new Map(wishes.hours.filter((h) => h.kind !== 'max').map((h) => [h.personId, h.kind === 'more' ? -1 : 1]));

  const onLeave = (id: number, slot: Slot) => input.leaves.some((l) => l.personId === id && overlaps(l, slot));

  function cost(p: PersonRow, slot: Slot, role: StaffRole, partner: number | undefined): number | null {
    const h = hoursOf(slot);
    const mine = busy.get(p.id) ?? [];
    if (mine.some((b) => overlaps(b, slot))) return null;
    if (onLeave(p.id, slot)) return null;
    const month = bkkMonth(slot.start);
    const inMonth = monthHours.get(`${p.id}|${month}`) ?? 0;
    if (inMonth + h > cap(p)) return null;
    if ((dayHours.get(`${p.id}|${liveDate(slot.start)}`) ?? 0) + h > input.maxDayHours) return null;
    const max = hourMax.get(p.id);
    if (max !== undefined && (plannedHours.get(p.id) ?? 0) + h > max) return null;
    const matching = wishes.rules.filter((r) => r.personId === p.id && ruleCovers(r, slot, role));
    if (matching.some((r) => r.kind === 'avoid' && r.strength === 'must')) return null;

    let c = 0;
    // Fair share: how far through their monthly target they already are (0 = nothing yet).
    const share = target(p) > 0 ? inMonth / target(p) : 1 + inMonth / 100;
    c += share * 100;
    // Full-time staff first; interns next; freelancers, guests and operation only as cover.
    if (p.employment === 'intern') c += 20;
    else if (p.employment !== 'full_time' || p.position === 'operation') c += 60;
    if (role === 'mc' && p.position !== 'mc') c += 40; // a PD hosting is a fallback
    const today = mine.filter((b) => liveDate(b.start) === liveDate(slot.start));
    const touching = today.find((b) => b.end.getTime() === slot.start.getTime() || b.start.getTime() === slot.end.getTime());
    if (touching) c -= touching.roomId === slot.roomId ? 80 : 20; // keep the block going, same room best
    else if (today.length) c += 30; // a second, separate block the same day
    if (slot.usual[role] === p.id) c -= 15;
    for (const r of matching) {
      if (r.kind === 'prefer') c -= r.strength === 'must' ? 60 : 30;
      else c += 60; // avoid, should
    }
    c += (hourLean.get(p.id) ?? 0) * 25;
    const weight = wishes.performanceWeight ?? 1;
    if (input.performance && weight > 0) {
      const code = input.performance.roomCode.get(slot.roomId);
      const band = bandOf(slot.start);
      // 1.5x the room's usual GMV per hour is worth about one fair-share nudge; capped both ways.
      const nudge = (ratio: number) => weight * Math.max(-30, Math.min(30, (ratio - 1) * 60));
      if (code) {
        c -= nudge(expected(input.performance.scores, p.nickname, role, code, band));
        // The PD is picked first, so the MC choice can also weigh how this pair sells together.
        const pd = role === 'mc' && partner !== undefined ? byId.get(partner) : undefined;
        if (pd) c -= nudge(expected(input.performance.scores, pairName(p.nickname, pd.nickname), 'pair', code, band));
      }
    }
    if (partner !== undefined) {
      for (const pair of wishes.pairs) {
        if (!((pair.a === p.id && pair.b === partner) || (pair.b === p.id && pair.a === partner))) continue;
        c += pair.kind === 'together' ? -30 : 60;
      }
    }
    return c;
  }

  function pick(slot: Slot, role: StaffRole, taken: number[]): number | undefined {
    let best: { id: number; c: number } | undefined;
    for (const p of people) {
      if (taken.includes(p.id) || !canTake(p, role)) continue;
      const c = cost(p, slot, role, taken[0]);
      if (c === null) continue;
      if (!best || c < best.c || (c === best.c && p.id < best.id)) best = { id: p.id, c };
    }
    return best?.id;
  }

  const out: Assignment[] = [];
  const order = [...input.slots].sort((a, b) => a.start.getTime() - b.start.getTime() || a.roomId - b.roomId);
  for (const slot of order) {
    if (input.holidays.some((h) => overlaps(h, slot))) {
      out.push({ slot, problems: ['holiday'] });
      continue;
    }
    // The scarcer role first: PDs can also host, so fill PD before MC takes them.
    const a: Assignment = { slot, problems: [] };
    if (slot.needsPd) {
      a.pd = pick(slot, 'pd', []);
      if (a.pd === undefined) a.problems.push('no_pd_free');
    }
    a.mc = pick(slot, 'mc', a.pd !== undefined ? [a.pd] : []);
    if (a.mc === undefined) a.problems.push('no_mc_free');
    if (a.problems.length === 0) {
      for (const id of [a.mc, a.pd]) {
        if (id === undefined) continue;
        book(id, slot, true);
        add(monthHours, `${id}|${bkkMonth(slot.start)}`, hoursOf(slot));
      }
    }
    out.push(a);
  }
  return out.sort((x, y) => x.slot.row - y.slot.row);
}

// ---- Putting it together

/** The Claude call failed (network, quota, refusal); the plan can still be made without wishes. */
export class AiFailed extends Error {
  constructor(readonly cause: unknown) {
    super('could not read the scheduling instructions');
  }
}

export interface AutoRequest {
  sourceFrom: string; // Monday of the pattern week
  targetFrom: string;
  targetTo: string;
  peopleIds: number[];
  maxDayHours: number;
  instructions: string;
  usePreferences: boolean;
  usePerformance: boolean;
}

export interface PersonSummary {
  personId: number;
  plannedHours: number;
  /** Hours per month after the plan (existing bookings + plan), with the target. */
  months: { month: string; hours: number; kpi: number | null; max: number }[];
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const bkk = (date: string, h: number) => new Date(`${date}T${String(h).padStart(2, '0')}:00:00+07:00`);

export async function planSchedule(
  pool: pg.Pool,
  req: AutoRequest,
  readWishes: WishReader | undefined,
): Promise<{ rows: BulkRow[]; wishes: Wishes | null; aiUsed: boolean; people: PersonSummary[]; preferencesUsed: number; performanceLives: number | null }> {
  const rooms = await listRooms(pool);
  const people = await listPeople(pool);
  const rules = await loadRules(pool);

  // The pattern week's lives, moved onto the target dates by weekday (staff kept only as a hint).
  const pattern = await copyRows(pool, { sourceFrom: req.sourceFrom, sourceTo: addDays(req.sourceFrom, 6), targetFrom: req.targetFrom, targetTo: req.targetTo });
  const slots: Slot[] = pattern.flatMap((r) => {
    if (!r.input) return [];
    const room = rooms.find((x) => x.id === r.input!.roomId);
    if (!room || !room.isActive) return [];
    const usual = Object.fromEntries(r.input.staff.map((s) => [s.role, s.personId]));
    return [
      {
        row: r.row,
        roomId: room.id,
        start: r.input.start,
        end: r.input.end,
        needsPd: room.roomType === 'live' && room.requiresPd,
        location: r.input.location,
        note: r.input.note ?? null,
        usual,
      },
    ];
  });

  let wishes: Wishes | null = null;
  const text = req.instructions.trim();
  // Each person's latest wishes for each month the plan touches.
  const preferences = req.usePreferences
    ? (await latestPreferences(pool, req.targetFrom.slice(0, 7), req.targetTo.slice(0, 7))).filter((p) => req.peopleIds.includes(p.personId))
    : [];
  const askAi = Boolean(readWishes && (text || preferences.length));
  if (askAi && readWishes) {
    let raw: RawWishes;
    try {
      raw = await readWishes({
      instructions: text,
      people: people.filter((p) => p.isActive).map((p) => ({ nickname: p.nickname, position: p.position, employment: p.employment })),
      rooms: rooms.filter((r) => r.isActive).map((r) => r.code),
      from: req.targetFrom,
      to: req.targetTo,
        preferences: preferences.map((p) => ({ nickname: p.nickname, month: p.month, text: p.text })),
      });
    } catch (err) {
      throw new AiFailed(err);
    }
    wishes = resolveWishes(raw, people, rooms);
  }

  // Whole months around the period, for the hour caps and fair shares.
  const from = monthRange(bkk(req.targetFrom, 12)).from;
  const to = new Date(Math.max(monthRange(bkk(req.targetTo, 12)).to.getTime(), bkk(addDays(req.targetTo, 1), LIVE_DAY_START_H).getTime()));
  const existing = await sessionsBetween(pool, from, to);
  const leaves = await leavesBetween(pool, bkk(req.targetFrom, 0), bkk(addDays(req.targetTo, 2), 0));
  const holidays = await holidaysBetween(pool, bkk(req.targetFrom, 0), bkk(addDays(req.targetTo, 2), 0));

  // Slots whose room is already taken at that time are left alone (the board already has them).
  const free = slots.filter((s) => !existing.some((e) => e.status !== 'cancelled' && e.roomId === s.roomId && overlaps(e, s)));
  const taken = slots.filter((s) => !free.includes(s));

  const perf = req.usePerformance ? await performanceScores(pool) : null;
  const plan = solve({
    slots: free,
    people,
    allowed: new Set(req.peopleIds),
    rules,
    existing,
    leaves,
    holidays,
    maxDayHours: req.maxDayHours,
    wishes: wishes ?? noWishes,
    performance: perf ? { scores: scoreMap(perf.scores), roomCode: new Map(rooms.map((r) => [r.id, r.code])) } : undefined,
  });

  const rows: BulkRow[] = [
    ...plan.map((a): BulkRow => {
      const staff = [
        ...(a.mc !== undefined ? [{ personId: a.mc, role: 'mc' as const }] : []),
        ...(a.pd !== undefined ? [{ personId: a.pd, role: 'pd' as const }] : []),
      ];
      return {
        row: a.slot.row,
        problems: a.problems,
        input: { roomId: a.slot.roomId, start: a.slot.start, end: a.slot.end, location: a.slot.location, note: a.slot.note, staff },
      };
    }),
    ...taken.map((s): BulkRow => ({ row: s.row, problems: ['room_taken'], input: { roomId: s.roomId, start: s.start, end: s.end, staff: [] } })),
  ].sort((a, b) => a.input!.start.getTime() - b.input!.start.getTime() || a.input!.roomId - b.input!.roomId);
  rows.forEach((r, i) => (r.row = i + 1));

  // Hours after the plan, for the summary table.
  const after: Session[] = [
    ...existing,
    ...plan.filter((a) => a.problems.length === 0).map((a) => ({
      roomId: a.slot.roomId,
      start: a.slot.start,
      end: a.slot.end,
      status: 'published' as const,
      staff: [
        ...(a.mc !== undefined ? [{ personId: a.mc, role: 'mc' as const }] : []),
        ...(a.pd !== undefined ? [{ personId: a.pd, role: 'pd' as const }] : []),
      ],
    })),
  ].map((o) => (o.status === 'draft' ? { ...o, status: 'published' as const } : o));
  const monthList = [...new Set(slots.map((s) => bkkMonth(s.start)))].sort();
  const totals = new Map(monthList.map((m) => [m, hoursByPerson(after, m)]));
  const planned = new Map<number, number>();
  for (const a of plan) {
    if (a.problems.length) continue;
    for (const id of [a.mc, a.pd]) if (id !== undefined) planned.set(id, (planned.get(id) ?? 0) + hoursOf(a.slot));
  }
  const summary: PersonSummary[] = people
    .filter((p) => req.peopleIds.includes(p.id) || planned.has(p.id))
    .map((p) => ({
      personId: p.id,
      plannedHours: planned.get(p.id) ?? 0,
      months: monthList.map((m) => {
        const t = totals.get(m)!.get(p.id) ?? { mc: 0, pd: 0 };
        return {
          month: m,
          hours: t.mc + t.pd,
          kpi: p.employment === 'full_time' && p.position !== 'operation' ? (p.kpiHours ?? rules.kpiHours[p.position]) : null,
          max: p.maxHours ?? rules.maxHours[p.position === 'mc' ? 'mc' : 'pd'],
        };
      }),
    }));

  return { rows, wishes, aiUsed: askAi, people: summary, preferencesUsed: askAi ? preferences.length : 0, performanceLives: perf ? perf.lives : null };
}

/** Who the AI may use unless the admin says otherwise: active full-time and intern MC/PD. */
export const defaultPool = (p: PersonRow) => p.isActive && p.position !== 'operation' && (p.employment === 'full_time' || p.employment === 'intern');
