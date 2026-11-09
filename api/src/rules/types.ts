import type { Interval } from './time.js';

export type StaffRole = 'mc' | 'pd';
export type Position = 'mc' | 'pd' | 'operation';
export type SessionStatus = 'draft' | 'published' | 'cancelled';

/** Tunable rules, edited from the Settings page (table `rules`). */
export interface Rules {
  kpiHours: Record<StaffRole, number>;
  maxHours: Record<StaffRole, number>;
  leaveQuotaPerDay: Record<StaffRole, number>;
  /** Normal leave days a full-time MC/PD may take per month (urgent leave not counted). */
  leaveMaxDaysPerMonth: Record<StaffRole, number>;
  sessionSlotMinutes: number; // default length for a new session
}

export interface Person {
  id: number;
  nickname: string;
  position: Position;
  isActive: boolean;
  maxHours?: number | null; // per-person override of rules.maxHours
  employment?: 'full_time' | 'intern' | 'freelance' | 'guest';
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
  /** Cancelled sessions: 'auto' follows the leave rules (see credit.ts); 'yes'/'no' is a manager's override. */
  hoursCredit?: 'auto' | 'yes' | 'no';
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
  reasonCode?: string | null;
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
