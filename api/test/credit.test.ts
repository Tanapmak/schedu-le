import { describe, expect, it } from 'vitest';
import { creditFor, liveDayEnd, type CreditContext, type CreditLeave, type Session } from '../src/rules/index.js';

const at = (s: string) => new Date(`${s}:00+07:00`);
const MC = 1;
const PD = 2;

// Ponz-style case: MC on urgent leave for 15:00-17:00, the session is cancelled.
const session: Session = {
  id: 10,
  roomId: 1,
  start: at('2026-11-08T15:00'),
  end: at('2026-11-08T17:00'),
  status: 'cancelled',
  countHoursWhenCancelled: true,
  staff: [
    { personId: MC, role: 'mc' },
    { personId: PD, role: 'pd' },
  ],
};

const leave = (over: Partial<CreditLeave> = {}): CreditLeave => ({
  id: 1, personId: MC, start: session.start, end: session.end, kind: 'urgent', reasonCode: 'sick', hasDocument: false, ...over,
});

const ctx = (over: Partial<CreditContext> & { work?: { personId: number; at: Date; sessionId?: number }[] } = {}): CreditContext => ({
  now: at('2026-11-10T12:00'),
  leaves: [leave()],
  workedBetween: (personId, from, to, except) =>
    (over.work ?? []).some((w) => w.personId === personId && w.at >= from && w.at < to && w.sessionId !== except),
  ...over,
});

const mc = session.staff[0];
const pd = session.staff[1];

describe('hours on a cancelled session', () => {
  it('gives the partner who was not on leave the hours straight away', () => {
    expect(creditFor(session, pd, ctx({ now: at('2026-11-08T16:00') }))).toMatchObject({ status: 'credited', code: 'cancelled_counted' });
  });

  it('waits for the end of the live day (06:00) before deciding sick leave', () => {
    const c = creditFor(session, mc, ctx({ now: at('2026-11-08T23:00') }));
    expect(c).toMatchObject({ status: 'pending', code: 'pending_day' });
    expect(c.decidesAt).toEqual(at('2026-11-09T06:00'));
    expect(liveDayEnd(at('2026-11-09T01:00'))).toEqual(at('2026-11-09T06:00')); // 01:00 still belongs to the 8th
  });

  it('pays sick leave when the person did not work again that day', () => {
    expect(creditFor(session, mc, ctx())).toMatchObject({ status: 'credited', code: 'leave_ok' });
  });

  it('does not pay when the person came back for a later session that day', () => {
    const work = [{ personId: MC, at: at('2026-11-08T20:00'), sessionId: 11 }];
    expect(creditFor(session, mc, ctx({ work, now: at('2026-11-08T21:00') }))).toMatchObject({ status: 'not_credited', code: 'returned' });
    // Before the later session starts it is still open: a cover may yet take it.
    expect(creditFor(session, mc, ctx({ work, now: at('2026-11-08T18:00') }))).toMatchObject({ status: 'pending', code: 'pending_day' });
    // Work before the cancelled session, or the next live day, does not count.
    const other = [
      { personId: MC, at: at('2026-11-08T10:00'), sessionId: 9 },
      { personId: MC, at: at('2026-11-09T07:00'), sessionId: 12 },
    ];
    expect(creditFor(session, mc, ctx({ work: other }))).toMatchObject({ code: 'leave_ok' });
  });

  it('never pays personal errands, other reasons or normal leave', () => {
    expect(creditFor(session, mc, ctx({ leaves: [leave({ reasonCode: 'errand' })] })).code).toBe('leave_reason_no_hours');
    expect(creditFor(session, mc, ctx({ leaves: [leave({ reasonCode: 'other' })] })).code).toBe('leave_reason_no_hours');
    expect(creditFor(session, mc, ctx({ leaves: [leave({ kind: 'normal', reasonCode: null })] })).code).toBe('leave_normal');
    expect(creditFor(session, mc, ctx({ leaves: [leave({ reasonCode: 'family' })] })).code).toBe('leave_ok');
    expect(creditFor(session, mc, ctx({ leaves: [leave({ reasonCode: 'accident' })] })).code).toBe('leave_ok');
  });

  it('needs a medical certificate for every day of sick leave two days or more in a row', () => {
    const dayBefore = leave({ id: 2, start: at('2026-11-07T06:00'), end: at('2026-11-08T06:00') });
    const pending = creditFor(session, mc, ctx({ leaves: [leave(), dayBefore] }));
    expect(pending).toMatchObject({ status: 'pending', code: 'pending_cert', sickRun: ['2026-11-07', '2026-11-08'] });
    expect(pending.certDeadline).toEqual(at('2026-12-25T00:00'));
    // A certificate on one day only is not enough.
    expect(creditFor(session, mc, ctx({ leaves: [leave({ hasDocument: true }), dayBefore] })).code).toBe('pending_cert');
    expect(creditFor(session, mc, ctx({ leaves: [leave({ hasDocument: true }), { ...dayBefore, hasDocument: true }] })).code).toBe('leave_ok');
    // Past the deadline: no hours.
    expect(creditFor(session, mc, ctx({ leaves: [leave(), dayBefore], now: at('2026-12-25T00:00') })).code).toBe('no_cert');
    // A gap day breaks the run.
    const twoDaysBefore = { ...dayBefore, start: at('2026-11-06T06:00'), end: at('2026-11-07T06:00') };
    expect(creditFor(session, mc, ctx({ leaves: [leave(), twoDaysBefore] })).code).toBe('leave_ok');
  });

  it('lets a manager override anyone', () => {
    expect(creditFor(session, { ...mc, hoursCredit: 'yes' }, ctx({ leaves: [leave({ reasonCode: 'errand' })] })).code).toBe('override_yes');
    expect(creditFor(session, { ...pd, hoursCredit: 'no' }, ctx()).status).toBe('not_credited');
    expect(creditFor({ ...session, status: 'published' }, mc, ctx()).code).toBe('published');
    expect(creditFor(session, { ...mc, replaced: true }, ctx()).code).toBe('replaced');
  });
});
