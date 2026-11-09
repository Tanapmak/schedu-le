import { overlaps } from './time.js';
import type { Session, StaffAssignment } from './types.js';

/**
 * Who earns hours for a session, person by person.
 *
 * Published: everyone not replaced. Cancelled: people who were not on leave earn hours
 * (force majeure, meetings, a partner who could not go live alone). People on leave earn
 * hours only for urgent sick / accident / family-emergency leave, and only if they did not
 * come back to work later that live day: if you are well enough to go live at 20:00, the
 * 15:00 "sick" leave earns nothing. Sick leave on two or more live days in a row needs a
 * medical certificate on every one of those days. A manager can override anyone.
 */

export type LeaveReason = 'sick' | 'accident' | 'family' | 'errand' | 'other';
export const LEAVE_REASONS: LeaveReason[] = ['sick', 'accident', 'family', 'errand', 'other'];
/** Urgent leave reasons that can still earn the hours of a cancelled session. */
export const HOURS_REASONS: LeaveReason[] = ['sick', 'accident', 'family'];

export type CancelReason = 'leave_no_cover' | 'force_majeure' | 'meeting' | 'brand' | 'other';
export const CANCEL_REASONS: CancelReason[] = ['leave_no_cover', 'force_majeure', 'meeting', 'brand', 'other'];

export type HoursCredit = 'auto' | 'yes' | 'no';

export interface CreditLeave {
  id: number;
  personId: number;
  start: Date;
  end: Date;
  kind: 'normal' | 'urgent';
  reasonCode: LeaveReason | null;
  hasDocument: boolean;
}

export type CreditStatus = 'credited' | 'not_credited' | 'pending';
export type CreditCode =
  | 'published'
  | 'replaced'
  | 'override_yes'
  | 'override_no'
  | 'cancelled_counted'
  | 'cancelled_not_counted'
  | 'leave_normal'
  | 'leave_reason_no_hours'
  | 'returned'
  | 'pending_day'
  | 'pending_cert'
  | 'no_cert'
  | 'leave_ok';

export interface Credit {
  status: CreditStatus;
  code: CreditCode;
  leaveId?: number;
  /** pending_day: when the live day ends and the system decides. */
  decidesAt?: Date;
  /** pending_cert / no_cert: last moment to attach a medical certificate. */
  certDeadline?: Date;
  /** pending_cert / no_cert: the live days in the sick run (YYYY-MM-DD). */
  sickRun?: string[];
}

export interface CreditContext {
  now: Date;
  /** Pending and approved leave of everyone involved, a few weeks either side. */
  leaves: CreditLeave[];
  /** Did the person work (published session or clock-in) starting in [from, to)? */
  workedBetween: (personId: number, from: Date, to: Date, exceptSessionId?: number) => boolean;
}

const HOUR_MS = 3_600_000;
const BKK_MS = 7 * HOUR_MS;
const LIVE_DAY_START_H = 6;
const CERT_DAY = 25; // same cutoff as back-recording live results

/** The live day (06:00 to 06:00, Bangkok) an instant belongs to, as YYYY-MM-DD. */
export const liveDate = (d: Date) => new Date(d.getTime() + BKK_MS - LIVE_DAY_START_H * HOUR_MS).toISOString().slice(0, 10);

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 24 * HOUR_MS).toISOString().slice(0, 10);

/** 06:00 Bangkok after the live day of `d`: when that day's leave is decided. */
export const liveDayEnd = (d: Date) => new Date(`${addDays(liveDate(d), 1)}T0${LIVE_DAY_START_H}:00:00+07:00`);

/** Live days an interval touches. */
export function liveDates(i: { start: Date; end: Date }): string[] {
  const out: string[] = [];
  const last = liveDate(new Date(i.end.getTime() - 1));
  for (let d = liveDate(i.start); d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Medical certificates for a session in month M are due by the 25th of M+1, 00:00 Bangkok. */
export function certDeadline(sessionStart: Date): Date {
  const [y, m] = new Date(sessionStart.getTime() + BKK_MS).toISOString().slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(y, m, CERT_DAY, -7));
}

/** Simple version for rule checks (hour caps): no leave lookups, overrides respected. */
export function countsHours(session: Session, st: Pick<StaffAssignment, 'replaced' | 'hoursCredit'> = {}): boolean {
  if (st.replaced) return false;
  if (session.status === 'published') return true;
  if (session.status !== 'cancelled') return false;
  if (st.hoursCredit === 'yes') return true;
  if (st.hoursCredit === 'no') return false;
  return session.countHoursWhenCancelled !== false;
}

/** The consecutive sick live days around `leave`, and whether every one has a certificate. */
function sickRun(leave: CreditLeave, ctx: CreditContext): { days: string[]; covered: boolean } {
  const sick = ctx.leaves.filter((l) => l.personId === leave.personId && l.kind === 'urgent' && l.reasonCode === 'sick');
  const byDay = new Map<string, CreditLeave[]>();
  for (const l of sick) for (const d of liveDates(l)) byDay.set(d, [...(byDay.get(d) ?? []), l]);
  const own = liveDates(leave);
  let first = own[0];
  let last = own[own.length - 1];
  while (byDay.has(addDays(first, -1))) first = addDays(first, -1);
  while (byDay.has(addDays(last, 1))) last = addDays(last, 1);
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  const covered = days.every((d) => (byDay.get(d) ?? [leave]).every((l) => l.hasDocument));
  return { days, covered };
}

export function creditFor(session: Session, st: StaffAssignment, ctx: CreditContext): Credit {
  if (st.replaced) return { status: 'not_credited', code: 'replaced' };
  if (session.status === 'published') return { status: 'credited', code: 'published' };
  if (session.status !== 'cancelled') return { status: 'not_credited', code: 'cancelled_not_counted' };
  if (st.hoursCredit === 'yes') return { status: 'credited', code: 'override_yes' };
  if (st.hoursCredit === 'no') return { status: 'not_credited', code: 'override_no' };

  const leave = ctx.leaves.find((l) => l.personId === st.personId && overlaps(l, session));
  if (!leave) {
    return session.countHoursWhenCancelled === false
      ? { status: 'not_credited', code: 'cancelled_not_counted' }
      : { status: 'credited', code: 'cancelled_counted' };
  }
  const leaveId = leave.id;
  if (leave.kind === 'normal') return { status: 'not_credited', code: 'leave_normal', leaveId };
  if (!leave.reasonCode || !HOURS_REASONS.includes(leave.reasonCode)) {
    return { status: 'not_credited', code: 'leave_reason_no_hours', leaveId };
  }

  // Came back later that live day? Counted from the start of the cancelled session, and only
  // sessions that have started by now (a later one still ahead may yet get a cover).
  const dayEnd = liveDayEnd(session.start);
  const upTo = new Date(Math.min(dayEnd.getTime(), ctx.now.getTime()));
  if (ctx.workedBetween(st.personId, session.start, upTo, session.id)) return { status: 'not_credited', code: 'returned', leaveId };
  if (ctx.now < dayEnd) return { status: 'pending', code: 'pending_day', leaveId, decidesAt: dayEnd };

  if (leave.reasonCode === 'sick') {
    const run = sickRun(leave, ctx);
    if (run.days.length >= 2 && !run.covered) {
      const deadline = certDeadline(session.start);
      return ctx.now < deadline
        ? { status: 'pending', code: 'pending_cert', leaveId, certDeadline: deadline, sickRun: run.days }
        : { status: 'not_credited', code: 'no_cert', leaveId, certDeadline: deadline, sickRun: run.days };
    }
  }
  return { status: 'credited', code: 'leave_ok', leaveId };
}
