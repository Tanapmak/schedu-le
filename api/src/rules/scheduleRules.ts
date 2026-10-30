import { bangkokDates, bangkokMonth, hoursOf, overlaps } from './time.js';
import type { Holiday, Leave, Person, Room, Rules, Session, StaffRole, Violation } from './types.js';

/** Which session roles a position may take. A PD can host as MC; an MC cannot run as PD. */
const allowedRoles: Record<Person['position'], StaffRole[]> = {
  mc: ['mc'],
  pd: ['mc', 'pd'],
  operation: [],
};

/** Hours a staff row earns: published sessions, plus cancelled ones still marked to count. Replaced people earn none. */
export function countsHours(session: Session, replaced = false): boolean {
  if (replaced) return false;
  if (session.status === 'published') return true;
  return session.status === 'cancelled' && session.countHoursWhenCancelled !== false;
}

/** Hours each person earns in a Bangkok month (YYYY-MM), split by the role they worked. */
export function hoursByPerson(sessions: Session[], month: string): Map<number, Record<StaffRole, number>> {
  const totals = new Map<number, Record<StaffRole, number>>();
  for (const s of sessions) {
    if (bangkokMonth(s.start) !== month) continue;
    for (const st of s.staff) {
      if (!countsHours(s, st.replaced)) continue;
      const t = totals.get(st.personId) ?? { mc: 0, pd: 0 };
      t[st.role] += hoursOf(s);
      totals.set(st.personId, t);
    }
  }
  return totals;
}

export interface SessionContext {
  rules: Rules;
  room: Room;
  people: Map<number, Person>;
  /** Other sessions near this one (any room); the session itself is skipped by id. */
  sessions: Session[];
  leaves: Leave[];
  holidays: Holiday[];
}

/**
 * Checks a session before it is saved. The database still enforces room and person
 * overlaps; these checks exist to give a clear message before that happens.
 */
export function checkSession(session: Session, ctx: SessionContext): Violation[] {
  const out: Violation[] = [];
  const add = (v: Violation) => out.push(v);

  if (session.end <= session.start) {
    add({ code: 'invalid_period', severity: 'error' });
    return out;
  }

  const slotMs = ctx.rules.sessionSlotMinutes * 60_000;
  if ((session.end.getTime() - session.start.getTime()) % slotMs !== 0) {
    add({ code: 'off_slot', severity: 'warning', detail: { slotMinutes: ctx.rules.sessionSlotMinutes } });
  }

  if (!ctx.room.isActive) add({ code: 'room_inactive', severity: 'error' });

  const working = session.staff.filter((s) => !s.replaced);
  const needsPd = ctx.room.roomType === 'live' && ctx.room.requiresPd;
  if (!working.some((s) => s.role === 'mc')) add({ code: 'missing_mc', severity: 'error' });
  if (needsPd && !working.some((s) => s.role === 'pd')) add({ code: 'missing_pd', severity: 'error' });

  const seen = new Set<number>();
  for (const st of session.staff) {
    if (seen.has(st.personId)) add({ code: 'duplicate_person', severity: 'error', personId: st.personId });
    seen.add(st.personId);

    const person = ctx.people.get(st.personId);
    if (!person) {
      add({ code: 'unknown_person', severity: 'error', personId: st.personId });
      continue;
    }
    if (!person.isActive) add({ code: 'person_inactive', severity: 'error', personId: st.personId });
    if (!allowedRoles[person.position].includes(st.role)) {
      add({ code: 'role_not_allowed', severity: 'error', personId: st.personId, detail: { role: st.role } });
    }
  }

  if (session.status === 'cancelled') return out; // a cancelled session blocks nothing

  const others = ctx.sessions.filter((o) => o.id === undefined || o.id !== session.id);
  const live = others.filter((o) => o.status !== 'cancelled' && overlaps(o, session));

  for (const o of live) {
    if (o.roomId === session.roomId) add({ code: 'room_busy', severity: 'error', sessionId: o.id });
  }

  for (const st of working) {
    for (const o of live) {
      if (o.staff.some((x) => x.personId === st.personId && !x.replaced)) {
        add({ code: 'person_busy', severity: 'error', personId: st.personId, sessionId: o.id });
      }
    }
    for (const l of ctx.leaves) {
      if (l.personId !== st.personId || !overlaps(l, session)) continue;
      if (l.status === 'approved') add({ code: 'on_leave', severity: 'error', personId: st.personId, leaveId: l.id });
      if (l.status === 'pending') add({ code: 'leave_pending', severity: 'warning', personId: st.personId, leaveId: l.id });
    }
  }

  for (const h of ctx.holidays) {
    if (overlaps(h, session)) add({ code: 'holiday', severity: 'error', detail: { name: h.name } });
  }

  // Monthly cap: everything already booked that month (drafts included, since they are
  // about to be published) plus this session.
  const month = bangkokMonth(session.start);
  const planned = others.map((o) => (o.status === 'draft' ? { ...o, status: 'published' as const } : o));
  const booked = hoursByPerson(planned, month);
  for (const st of working) {
    const person = ctx.people.get(st.personId);
    if (!person) continue;
    const t = booked.get(st.personId) ?? { mc: 0, pd: 0 };
    const total = t.mc + t.pd + hoursOf(session);
    const cap = person.maxHours ?? ctx.rules.maxHours[person.position === 'mc' ? 'mc' : 'pd'];
    if (total > cap) {
      add({ code: 'over_max_hours', severity: 'warning', personId: st.personId, detail: { hours: total, max: cap, month } });
    }
  }

  return out;
}

export interface LeaveContext {
  rules: Rules;
  people: Map<number, Person>;
  /** Other leave requests near this one; the request itself is skipped by id. */
  leaves: Leave[];
  sessions: Session[];
}

/**
 * Checks a leave request. At most `leaveQuotaPerDay` people of the same position may be
 * off (pending or approved) on any day. Urgent leave may go over the quota, with a warning.
 */
export function checkLeave(leave: Leave, ctx: LeaveContext): Violation[] {
  const out: Violation[] = [];
  if (leave.end <= leave.start) return [{ code: 'invalid_period', severity: 'error' }];

  const person = ctx.people.get(leave.personId);
  if (!person) return [{ code: 'unknown_person', severity: 'error', personId: leave.personId }];

  const holding = (l: Leave) => l.status === 'pending' || l.status === 'approved';
  const others = ctx.leaves.filter((l) => (l.id === undefined || l.id !== leave.id) && holding(l));

  if (others.some((l) => l.personId === leave.personId && overlaps(l, leave))) {
    out.push({ code: 'leave_overlap', severity: 'error', personId: leave.personId });
  }

  if (person.position !== 'operation') {
    const quota = ctx.rules.leaveQuotaPerDay[person.position];
    for (const date of bangkokDates(leave)) {
      const off = new Set(
        others
          .filter((l) => l.personId !== leave.personId && bangkokDates(l).includes(date))
          .filter((l) => ctx.people.get(l.personId)?.position === person.position)
          .map((l) => l.personId),
      );
      if (off.size >= quota) {
        out.push({
          code: 'leave_quota_full',
          severity: leave.kind === 'urgent' ? 'warning' : 'error',
          detail: { date, quota, alreadyOff: off.size },
        });
      }
    }
  }

  for (const s of ctx.sessions) {
    if (s.status === 'cancelled' || !overlaps(s, leave)) continue;
    if (s.staff.some((st) => st.personId === leave.personId && !st.replaced)) {
      out.push({ code: 'has_sessions', severity: 'warning', personId: leave.personId, sessionId: s.id });
    }
  }

  return out;
}

export const hasErrors = (violations: Violation[]) => violations.some((v) => v.severity === 'error');
