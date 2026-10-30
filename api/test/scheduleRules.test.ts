import { describe, expect, it } from 'vitest';
import {
  bangkokDates,
  bangkokMonth,
  checkLeave,
  checkSession,
  hasErrors,
  hoursByPerson,
  type Leave,
  type Person,
  type Room,
  type Rules,
  type Session,
  type SessionContext,
} from '../src/rules/index.js';

const rules: Rules = {
  kpiHours: { mc: 96, pd: 132 },
  maxHours: { mc: 124, pd: 176 },
  leaveQuotaPerDay: { mc: 2, pd: 2 },
  sessionSlotMinutes: 120,
};

const people = new Map<number, Person>(
  (
    [
      [1, 'MC A', 'mc'],
      [2, 'MC B', 'mc'],
      [3, 'MC C', 'mc'],
      [4, 'PD A', 'pd'],
      [5, 'PD B', 'pd'],
      [6, 'Ops', 'operation'],
    ] as const
  ).map(([id, nickname, position]) => [id, { id, nickname, position, isActive: true }]),
);

const liveRoom: Room = { id: 10, code: 'TTS 1', roomType: 'live', requiresPd: true, isActive: true };
const contentRoom: Room = { id: 11, code: 'Content', roomType: 'content', requiresPd: false, isActive: true };

// Bangkok local time -> Date
const bkk = (local: string) => new Date(`${local}:00+07:00`);

const session = (from: string, to: string, over: Partial<Session> = {}): Session => ({
  roomId: liveRoom.id,
  start: bkk(from),
  end: bkk(to),
  status: 'published',
  staff: [
    { personId: 1, role: 'mc' },
    { personId: 4, role: 'pd' },
  ],
  ...over,
});

const ctx = (over: Partial<SessionContext> = {}): SessionContext => ({
  rules,
  room: liveRoom,
  people,
  sessions: [],
  leaves: [],
  holidays: [],
  ...over,
});

const codes = (vs: { code: string }[]) => vs.map((v) => v.code);

describe('time helpers', () => {
  it('uses Bangkok dates, not UTC', () => {
    expect(bangkokMonth(bkk('2026-11-01T01:00'))).toBe('2026-11'); // still Oct 31 in UTC
    expect(bangkokDates({ start: bkk('2026-11-01T22:00'), end: bkk('2026-11-02T02:00') })).toEqual([
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(bangkokDates({ start: bkk('2026-11-01T00:00'), end: bkk('2026-11-02T00:00') })).toEqual(['2026-11-01']);
  });
});

describe('checkSession', () => {
  it('accepts a normal 2-hour live session', () => {
    expect(checkSession(session('2026-11-02T10:00', '2026-11-02T12:00'), ctx())).toEqual([]);
  });

  it('needs an MC, and a PD in live rooms', () => {
    const noStaff = session('2026-11-02T10:00', '2026-11-02T12:00', { staff: [] });
    expect(codes(checkSession(noStaff, ctx()))).toEqual(['missing_mc', 'missing_pd']);
    const mcOnly = session('2026-11-02T10:00', '2026-11-02T12:00', {
      roomId: contentRoom.id,
      staff: [{ personId: 1, role: 'mc' }],
    });
    expect(checkSession(mcOnly, ctx({ room: contentRoom }))).toEqual([]);
  });

  it('lets a PD host as MC but not an MC run as PD', () => {
    const pdHosts = session('2026-11-02T10:00', '2026-11-02T12:00', {
      staff: [
        { personId: 5, role: 'mc' },
        { personId: 4, role: 'pd' },
      ],
    });
    expect(checkSession(pdHosts, ctx())).toEqual([]);
    const mcAsPd = session('2026-11-02T10:00', '2026-11-02T12:00', {
      staff: [
        { personId: 1, role: 'mc' },
        { personId: 2, role: 'pd' },
      ],
    });
    expect(checkSession(mcAsPd, ctx())).toMatchObject([{ code: 'role_not_allowed', personId: 2 }]);
  });

  it('flags a room or person already booked, but not back-to-back or cancelled sessions', () => {
    const existing = [
      session('2026-11-02T09:00', '2026-11-02T11:00', { id: 1 }),
      session('2026-11-02T12:00', '2026-11-02T14:00', { id: 2 }),
      session('2026-11-02T10:00', '2026-11-02T12:00', { id: 3, roomId: 99, status: 'cancelled' }),
    ];
    const v = checkSession(session('2026-11-02T10:00', '2026-11-02T12:00'), ctx({ sessions: existing }));
    expect(v.map((x) => [x.code, x.sessionId])).toEqual([
      ['room_busy', 1],
      ['person_busy', 1],
      ['person_busy', 1],
    ]);
  });

  it('ignores itself when an existing session is edited', () => {
    const s = session('2026-11-02T10:00', '2026-11-02T12:00', { id: 7 });
    expect(checkSession(s, ctx({ sessions: [s] }))).toEqual([]);
  });

  it('does not count a replaced person as busy', () => {
    const existing = session('2026-11-02T10:00', '2026-11-02T12:00', {
      id: 1,
      roomId: 12,
      staff: [
        { personId: 1, role: 'mc', replaced: true },
        { personId: 2, role: 'mc' },
      ],
    });
    expect(checkSession(session('2026-11-02T10:00', '2026-11-02T12:00'), ctx({ sessions: [existing] }))).toEqual([]);
  });

  it('blocks approved leave and holidays, warns on pending leave', () => {
    const leaves: Leave[] = [
      { id: 1, personId: 1, start: bkk('2026-11-02T00:00'), end: bkk('2026-11-03T00:00'), status: 'approved', kind: 'normal' },
      { id: 2, personId: 4, start: bkk('2026-11-02T00:00'), end: bkk('2026-11-03T00:00'), status: 'pending', kind: 'normal' },
      { id: 3, personId: 1, start: bkk('2026-11-02T00:00'), end: bkk('2026-11-03T00:00'), status: 'rejected', kind: 'normal' },
    ];
    const holidays = [{ name: 'Loy Krathong', start: bkk('2026-11-02T00:00'), end: bkk('2026-11-03T00:00') }];
    const v = checkSession(session('2026-11-02T10:00', '2026-11-02T12:00'), ctx({ leaves, holidays }));
    expect(v.map((x) => [x.code, x.severity])).toEqual([
      ['on_leave', 'error'],
      ['leave_pending', 'warning'],
      ['holiday', 'error'],
    ]);
    expect(hasErrors(v)).toBe(true);
  });

  it('warns past the monthly hour cap, counting drafts and counted cancellations', () => {
    // 61 two-hour sessions = 122 h for MC A in November; one more makes 124 (= cap), two more 126.
    const booked: Session[] = Array.from({ length: 61 }, (_, i) => {
      const day = String(1 + (i % 30)).padStart(2, '0');
      const hour = 8 + 2 * Math.floor(i / 30);
      const from = `2026-11-${day}T${String(hour).padStart(2, '0')}:00`;
      const to = `2026-11-${day}T${String(hour + 2).padStart(2, '0')}:00`;
      return session(from, to, { id: 100 + i, roomId: 50 + i, status: i % 2 ? 'draft' : 'published' });
    });
    const atCap = checkSession(session('2026-11-30T20:00', '2026-11-30T22:00'), ctx({ sessions: booked }));
    expect(codes(atCap)).toEqual([]);

    const extra = session('2026-11-29T20:00', '2026-11-29T22:00', { id: 999, roomId: 98 });
    const over = checkSession(session('2026-11-30T20:00', '2026-11-30T22:00'), ctx({ sessions: [...booked, extra] }));
    expect(over).toMatchObject([{ code: 'over_max_hours', severity: 'warning', personId: 1, detail: { hours: 126, max: 124 } }]);
  });

  it('warns when the length is not a whole number of slots', () => {
    expect(codes(checkSession(session('2026-11-02T10:00', '2026-11-02T11:30'), ctx()))).toEqual(['off_slot']);
  });

  it('rejects an empty or backwards period', () => {
    expect(codes(checkSession(session('2026-11-02T12:00', '2026-11-02T10:00'), ctx()))).toEqual(['invalid_period']);
  });
});

describe('hoursByPerson', () => {
  it('counts published and cancelled-but-counted sessions, by role, in the start month', () => {
    const sessions: Session[] = [
      session('2026-11-02T10:00', '2026-11-02T12:00'),
      session('2026-11-03T10:00', '2026-11-03T12:00', { status: 'cancelled' }),
      session('2026-11-04T10:00', '2026-11-04T12:00', { status: 'cancelled', countHoursWhenCancelled: false }),
      session('2026-11-05T10:00', '2026-11-05T12:00', { status: 'draft' }),
      session('2026-10-31T23:00', '2026-11-01T01:00'), // October in Bangkok
      session('2026-11-06T10:00', '2026-11-06T12:00', {
        staff: [
          { personId: 1, role: 'mc', replaced: true },
          { personId: 5, role: 'mc' },
          { personId: 4, role: 'pd' },
        ],
      }),
    ];
    const h = hoursByPerson(sessions, '2026-11');
    expect(h.get(1)).toEqual({ mc: 4, pd: 0 });
    expect(h.get(4)).toEqual({ mc: 0, pd: 6 });
    expect(h.get(5)).toEqual({ mc: 2, pd: 0 });
  });
});

describe('checkLeave', () => {
  const leave = (id: number, personId: number, from: string, to: string, over: Partial<Leave> = {}): Leave => ({
    id,
    personId,
    start: bkk(from),
    end: bkk(to),
    status: 'pending',
    kind: 'normal',
    ...over,
  });
  const lctx = (leaves: Leave[] = [], sessions: Session[] = []) => ({ rules, people, leaves, sessions });

  it('allows leave while the quota has room', () => {
    const others = [leave(1, 2, '2026-11-10T00:00', '2026-11-11T00:00')];
    expect(checkLeave(leave(9, 1, '2026-11-10T00:00', '2026-11-11T00:00'), lctx(others))).toEqual([]);
  });

  it('blocks a third MC on the same day, counting only the same position', () => {
    const others = [
      leave(1, 2, '2026-11-10T00:00', '2026-11-11T00:00', { status: 'approved' }),
      leave(2, 3, '2026-11-10T00:00', '2026-11-11T00:00'),
      leave(3, 4, '2026-11-10T00:00', '2026-11-11T00:00'), // PD, separate quota
      leave(4, 5, '2026-11-10T00:00', '2026-11-11T00:00', { status: 'rejected' }),
    ];
    expect(checkLeave(leave(9, 1, '2026-11-10T00:00', '2026-11-11T00:00'), lctx(others))).toMatchObject([
      { code: 'leave_quota_full', severity: 'error', detail: { date: '2026-11-10', quota: 2, alreadyOff: 2 } },
    ]);
  });

  it('lets urgent leave go over the quota with a warning', () => {
    const others = [
      leave(1, 2, '2026-11-10T00:00', '2026-11-11T00:00'),
      leave(2, 3, '2026-11-10T00:00', '2026-11-11T00:00'),
    ];
    const v = checkLeave(leave(9, 1, '2026-11-10T00:00', '2026-11-11T00:00', { kind: 'urgent' }), lctx(others));
    expect(v).toMatchObject([{ code: 'leave_quota_full', severity: 'warning' }]);
    expect(hasErrors(v)).toBe(false);
  });

  it('checks each day of a multi-day request', () => {
    const others = [
      leave(1, 2, '2026-11-11T00:00', '2026-11-12T00:00'),
      leave(2, 3, '2026-11-11T00:00', '2026-11-12T00:00'),
    ];
    const v = checkLeave(leave(9, 1, '2026-11-10T00:00', '2026-11-13T00:00'), lctx(others));
    expect(v.map((x) => x.detail?.date)).toEqual(['2026-11-11']);
  });

  it('rejects overlapping requests from the same person and warns about booked sessions', () => {
    const mine = [leave(1, 1, '2026-11-10T00:00', '2026-11-11T00:00')];
    const booked = [session('2026-11-12T10:00', '2026-11-12T12:00', { id: 5 })];
    expect(codes(checkLeave(leave(9, 1, '2026-11-10T12:00', '2026-11-13T00:00'), lctx(mine, booked)))).toEqual([
      'leave_overlap',
      'has_sessions',
    ]);
  });
});
