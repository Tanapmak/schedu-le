import type { Interval } from './time.js';

export type StaffRole = 'mc' | 'pd';
export type Position = 'mc' | 'pd' | 'operation';
export type SessionStatus = 'draft' | 'published' | 'cancelled';

/** Tunable rules, edited from the Settings page (table `rules`). */
export interface Rules {
  kpiHours: Record<StaffRole, number>;
  maxHours: Record<StaffRole, number>;
  leaveQuotaPerDay: Record<StaffRole, number>;
  sessionSlotMinutes: number;
}

export interface Person {
  id: number;
  nickname: string;
  position: Position;
  isActive: boolean;
  maxHours?: number | null; // per-person override of rules.maxHours
}

export interface Room {
  id: number;
  code: string;
  roomType: 'live' | 'content';
  requiresPd: boolean;
  isActive: boolean;
}

export interface StaffAssignment {
  personId: number;
  role: StaffRole;
  replaced?: boolean;
}

/** A session as stored, used both as the thing being checked and as existing bookings. */
export interface Session extends Interval {
  id?: number;
  roomId: number;
  status: SessionStatus;
  countHoursWhenCancelled?: boolean;
  staff: StaffAssignment[];
}

export interface Leave extends Interval {
  id?: number;
  personId: number;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  kind: 'normal' | 'urgent';
}

export interface Holiday extends Interval {
  name: string;
}

export type Severity = 'error' | 'warning';

/**
 * One broken rule. `error` blocks saving; `warning` lets an admin save after confirming.
 * `code` is stable so the web app can translate it (TH/EN/ZH).
 */
export interface Violation {
  code: string;
  severity: Severity;
  personId?: number;
  sessionId?: number;
  leaveId?: number;
  detail?: Record<string, string | number>;
}
