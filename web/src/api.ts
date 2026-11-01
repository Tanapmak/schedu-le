import type { ViolationLike } from './i18n';

export type StaffRole = 'mc' | 'pd';

export interface Room {
  id: number;
  code: string;
  name: string;
  platform: 'tiktok' | 'shopee' | 'lazada';
  roomType: 'live' | 'content';
  requiresPd: boolean;
  isActive: boolean;
}

export interface Person {
  id: number;
  nickname: string;
  position: 'mc' | 'pd' | 'operation';
  employment: 'full_time' | 'intern' | 'freelance' | 'guest';
  isActive: boolean;
  maxHours: number | null;
  kpiHours: number | null;
}

export interface Staff {
  personId: number;
  role: 'mc' | 'pd';
  replaced: boolean;
}

export interface Session {
  id: number;
  roomId: number;
  start: string;
  end: string;
  status: 'draft' | 'published' | 'cancelled';
  location: string;
  note: string | null;
  cancelReason: string | null;
  staff: Staff[];
}

export interface Leave {
  id: number;
  personId: number;
  start: string;
  end: string;
  status: 'pending' | 'approved';
  kind: 'normal' | 'urgent';
}

export interface Holiday {
  id: number;
  name: string;
  start: string;
  end: string;
}

export interface Board {
  sessions: Session[];
  leaves: Leave[];
  holidays: Holiday[];
}

export interface SessionInput {
  roomId: number;
  start: string;
  end: string;
  note?: string | null;
  staff: { personId: number; role: 'mc' | 'pd'; replaced?: boolean }[];
}

export interface SaveResponse {
  ok: boolean;
  id?: number;
  violations: ViolationLike[];
}

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface LeaveRequest {
  id: number;
  personId: number;
  start: string;
  end: string;
  kind: 'normal' | 'urgent';
  reason: string | null;
  status: RequestStatus;
  createdAt: string;
  decidedBy: string | null;
}

export interface SessionRef {
  id: number;
  roomId: number;
  start: string;
  end: string;
}

export interface SwapRequest {
  id: number;
  requesterId: number;
  targetId: number;
  reason: string | null;
  status: RequestStatus;
  createdAt: string;
  session: SessionRef;
  targetSession: SessionRef | null;
}

/** Leave, swap and decision calls: ok, or the rule codes that blocked (errors) or need confirming (warnings). */
export interface Outcome {
  ok: boolean;
  id?: number;
  violations: ViolationLike[];
}

export interface LeaveInput {
  start: string;
  end: string;
  kind: 'normal' | 'urgent';
  reason?: string;
  personId?: number;
}

export interface SwapInput {
  sessionId: number;
  targetId: number;
  targetSessionId?: number | null;
  reason?: string;
}

export interface HoursRow {
  personId: number;
  nickname: string;
  position: Person['position'];
  employment: Person['employment'];
  mcHours: number;
  pdHours: number;
  totalHours: number;
  doneHours: number;
  cancelledCountedHours: number;
  sessions: number;
  kpiHours: number | null;
  maxHours: number | null;
  ownRoleHours: number;
  crossRoleHours: number;
  vsKpi: number | null;
}

export type Role = 'admin' | 'operation' | 'mc' | 'pd' | 'viewer';

/** Admin (master) and operation both run the schedule; only admin manages the team. */
export const isManager = (role: Role | undefined) => role === 'admin' || role === 'operation';

export interface Member {
  id: number;
  nickname: string;
  fullName: string | null;
  email: string | null;
  position: Person['position'];
  employment: Person['employment'];
  role: Role;
  isActive: boolean;
  startDate: string | null;
}
export type MemberInput = Omit<Member, 'id'>;
export type MemberSave = { ok: true; member: Member } | { ok: false; error: string; field?: string; message?: string };

export interface User {
  id: number;
  nickname: string;
  email: string;
  role: Role;
  position: Person['position'];
}

export interface Me {
  user: User;
  mode: 'iap' | 'dev';
  devUsers?: { nickname: string; email: string; role: Role }[];
  /** False when no AI key is set on the server: results are typed in by hand. */
  aiReader?: boolean;
}

export const METRICS = ['gmv', 'orders', 'itemsSold', 'views', 'avgViewSec', 'productClicks', 'buyers', 'addToCart', 'adsCost', 'durationMin'] as const;
export type Metric = (typeof METRICS)[number];

export interface Reading {
  platform: string;
  account_name: string | null;
  live_started_at: string | null;
  duration_min: number | null;
  gmv: number | null;
  orders: number | null;
  items_sold: number | null;
  views: number | null;
  avg_view_sec: number | null;
  product_clicks: number | null;
  buyers: number | null;
  add_to_cart: number | null;
  ads_cost: number | null;
  extra: { label: string; value: string }[];
  unsure: string[];
}

export interface ResultRow extends Partial<Record<Metric, number | null>> {
  id: number;
  sessionId: number | null;
  roomId: number;
  broadcastId: number;
  isNewBroadcast: boolean;
  capturedAt: string;
  liveStartedAt: string | null;
  extraMetrics: Record<string, string>;
  source: 'ai' | 'manual';
  note: string | null;
  gmvDelta: number | null;
  ordersDelta: number | null;
  viewsDelta: number | null;
  recordedBy: string | null;
}

export interface ResultInput {
  sessionId: number;
  capturedAt: string;
  liveStartedAt: string | null;
  isNewBroadcast: boolean;
  metrics: Partial<Record<Metric, number>>;
  extraMetrics: Record<string, string>;
  source: 'ai' | 'manual';
  aiReading: Reading | null;
  note?: string;
}

export interface Studio {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface Attendance {
  id: number;
  personId: number;
  sessionId: number | null;
  clockInAt: string;
  clockOutAt: string | null;
  inDistanceM: number | null;
  inArea: boolean;
  outDistanceM: number | null;
  offsiteReason: string | null;
  status: 'ok' | 'pending' | 'approved' | 'rejected';
  adjustedHours: number | null;
  adjustNote: string | null;
  correctionId: number | null;
}

export interface Correction {
  id: number;
  personId: number;
  nickname: string;
  sessionId: number;
  roomId: number;
  sessionStart: string;
  sessionEnd: string;
  current: { clockInAt: string; clockOutAt: string | null } | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  reason: string;
  distanceM: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface CorrectableSession {
  id: number;
  roomId: number;
  start: string;
  end: string;
  location: 'studio' | 'offsite' | 'home';
  offsite: { lat: number; lng: number } | null;
  attendance: { clockInAt: string; clockOutAt: string | null } | null;
  pendingCorrectionId: number | null;
}

export interface MyAttendance {
  session: { id: number; roomId: number; start: string; end: string; role: StaffRole; location: 'studio' | 'offsite' | 'home'; offsite: { lat: number; lng: number } | null } | null;
  opensAt: string | null;
  windowMinutes: number;
  open: Attendance | null;
  records: Attendance[];
  studios: Studio[];
  correctable: CorrectableSession[];
  corrections: Correction[];
}

export type AttendanceState = 'done' | 'working' | 'forgot_out' | 'cancelled' | 'not_yet' | 'not_in' | 'missed';

export interface DayAttendance {
  rows: {
    personId: number;
    role: StaffRole;
    session: { id: number; roomId: number; start: string; end: string; status: string };
    attendance: Attendance | null;
    lateMin: number;
    countedHours: number;
    state: AttendanceState;
  }[];
  windowMinutes: number;
  studios: Studio[];
}

export type ClockResult = { ok: true; id: number; inArea: boolean; distanceM: number | null; status: Attendance['status'] } | { ok: false; error: string; opensAt?: string };
type Fix = { lat: number; lng: number } | null;

/** Sign-in problems: 401 not signed in, 403 signed in but not on the team list. */
export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly email: string | null,
  ) {
    super(`auth ${status}`);
  }
}

// Local development has no Google sign-in; the user switcher picks who to act as.
const DEV_USER_KEY = 'devUser';
export function devUser(): string | null {
  try {
    return localStorage.getItem(DEV_USER_KEY);
  } catch {
    return null;
  }
}
export function setDevUser(email: string) {
  try {
    localStorage.setItem(DEV_USER_KEY, email);
  } catch {
    // storage blocked; the switch lasts until reload
  }
}

/** Downloads the month's payroll workbook (admin only). */
export async function downloadPayroll(month: string): Promise<boolean> {
  const asUser = devUser();
  const res = await fetch(`/api/export/payroll?month=${month}`, { headers: asUser ? { 'x-dev-user': asUser } : {} });
  if (!res.ok) return false;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: `schedu-le-payroll-${month}.xlsx` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const asUser = devUser();
  if (asUser) headers['x-dev-user'] = asUser;
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status >= 500) throw new Error(`${method} ${path}: ${res.status}`);
  if (res.status === 401 || (res.status === 403 && path === '/api/me')) {
    const data = (await res.json().catch(() => ({}))) as { email?: string };
    throw new AuthError(res.status, data.email ?? null);
  }
  return { status: res.status, data: (await res.json()) as T };
}

export const api = {
  me: async () => (await request<Me>('GET', '/api/me')).data,
  rooms: async () => (await request<Room[]>('GET', '/api/rooms')).data,
  people: async () => (await request<Person[]>('GET', '/api/people')).data,
  board: async (from: Date, to: Date) =>
    (await request<Board>('GET', `/api/board?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)).data,
  check: async (input: SessionInput & { id?: number }) =>
    (await request<{ violations: ViolationLike[] }>('POST', '/api/sessions/check', input)).data.violations ?? [],
  save: async (input: SessionInput, opts: { id?: number; confirm?: boolean }) =>
    (
      await request<SaveResponse>(opts.id ? 'PUT' : 'POST', opts.id ? `/api/sessions/${opts.id}` : '/api/sessions', {
        ...input,
        confirm: opts.confirm,
      })
    ).data,
  cancel: async (id: number, reason: string, countHours: boolean) =>
    (await request<{ ok: boolean }>('POST', `/api/sessions/${id}/cancel`, { reason, countHours })).data,
  merge: async (id: number, withId: number) =>
    (await request<{ ok: boolean }>('POST', `/api/sessions/${id}/merge`, { withId })).data,
  remove: async (id: number) => (await request<{ ok: boolean }>('DELETE', `/api/sessions/${id}`)).data,
  leave: async (q: { mine?: boolean; status?: string } = {}) =>
    (await request<LeaveRequest[]>('GET', `/api/leave?${new URLSearchParams({ ...(q.mine ? { mine: '1' } : {}), ...(q.status ? { status: q.status } : {}) })}`)).data,
  fileLeave: async (input: LeaveInput, confirm = false) => (await request<Outcome>('POST', '/api/leave', { ...input, confirm })).data,
  decideLeave: async (id: number, decision: 'approve' | 'reject', confirm = false) =>
    (await request<Outcome>('POST', `/api/leave/${id}/decision`, { decision, confirm })).data,
  withdrawLeave: async (id: number) => (await request<{ ok: boolean }>('POST', `/api/leave/${id}/withdraw`, {})).data,
  swaps: async (q: { mine?: boolean; status?: string } = {}) =>
    (await request<SwapRequest[]>('GET', `/api/swaps?${new URLSearchParams({ ...(q.mine ? { mine: '1' } : {}), ...(q.status ? { status: q.status } : {}) })}`)).data,
  fileSwap: async (input: SwapInput) => (await request<Outcome>('POST', '/api/swaps', input)).data,
  decideSwap: async (id: number, decision: 'approve' | 'reject', confirm = false) =>
    (await request<Outcome>('POST', `/api/swaps/${id}/decision`, { decision, confirm })).data,
  withdrawSwap: async (id: number) => (await request<{ ok: boolean }>('POST', `/api/swaps/${id}/withdraw`, {})).data,
  holidays: async (from: Date, to: Date) =>
    (await request<Holiday[]>('GET', `/api/holidays?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)).data,
  addHoliday: async (name: string, start: string, end: string) =>
    (await request<{ ok: boolean; id: number; sessionsOnDay: number[] }>('POST', '/api/holidays', { name, start, end })).data,
  removeHoliday: async (id: number) => (await request<{ ok: boolean }>('DELETE', `/api/holidays/${id}`)).data,
  hours: async (month: string) => (await request<{ month: string; rows: HoursRow[] }>('GET', `/api/hours?month=${month}`)).data.rows,
  readScreenshot: async (sessionId: number, image: string) =>
    request<{ reading: Reading; liveStartedAt: string | null; isNewBroadcast: boolean; error?: string }>('POST', '/api/results/read', { sessionId, image }),
  suggestFlag: async (sessionId: number, liveStartedAt: string | null) =>
    (await request<{ isNewBroadcast: boolean }>('GET', `/api/results/flag?sessionId=${sessionId}${liveStartedAt ? `&liveStartedAt=${encodeURIComponent(liveStartedAt)}` : ''}`)).data.isNewBroadcast,
  saveResult: async (input: ResultInput) => request<{ ok: boolean; id: number; message?: string }>('POST', '/api/results', input),
  results: async (from: Date, to: Date) =>
    (await request<ResultRow[]>('GET', `/api/results?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)).data,
  myAttendance: async () => (await request<MyAttendance>('GET', '/api/attendance/me')).data,
  clockIn: async (at: Fix, reason?: string) => (await request<ClockResult>('POST', '/api/attendance/clock-in', { ...at, reason })).data,
  clockOut: async (at: Fix) => (await request<ClockResult>('POST', '/api/attendance/clock-out', { ...at })).data,
  corrections: async () => (await request<Correction[]>('GET', '/api/attendance/corrections')).data,
  requestCorrection: async (input: { sessionId: number; clockInAt: string | null; clockOutAt: string | null; reason: string }, at: Fix) =>
    (await request<{ ok: true; id: number } | { ok: false; error: string; message?: string }>('POST', '/api/attendance/corrections', { ...input, ...at })).data,
  decideCorrection: async (id: number, decision: 'approve' | 'reject') =>
    (await request<{ ok: boolean; error?: string }>('POST', `/api/attendance/corrections/${id}/decision`, { decision })).data,
  withdrawCorrection: async (id: number) => (await request<{ ok: boolean }>('POST', `/api/attendance/corrections/${id}/withdraw`)).data,
  dayAttendance: async (date: string) => (await request<DayAttendance>('GET', `/api/attendance?date=${date}`)).data,
  decideAttendance: async (id: number, decision: 'approve' | 'reject') =>
    (await request<{ ok: boolean }>('POST', `/api/attendance/${id}/decision`, { decision })).data,
  adjustAttendance: async (id: number, hours: number | null, note: string) =>
    (await request<{ ok: boolean }>('POST', `/api/attendance/${id}/adjust`, { hours, note })).data,
  team: async () => (await request<Member[]>('GET', '/api/team')).data,
  saveMember: async (input: MemberInput, id?: number): Promise<MemberSave> => {
    const { status, data } = await request<Member & { error?: string; field?: string; message?: string }>(id ? 'PUT' : 'POST', id ? `/api/team/${id}` : '/api/team', input);
    return status === 200 ? { ok: true, member: data } : { ok: false, error: data.error ?? 'error', field: data.field, message: data.message };
  },
  studios: async () => (await request<Studio[]>('GET', '/api/studios')).data,
  saveStudio: async (s: Omit<Studio, 'id'> & { id?: number }) => (await request<{ ok: boolean; id: number }>('POST', '/api/studios', s)).data,
  deleteResult: async (id: number) => (await request<{ ok: boolean }>('DELETE', `/api/results/${id}`)).data,
  publish: async (from: Date, to: Date) =>
    (await request<{ published: number }>('POST', '/api/publish', { from: from.toISOString(), to: to.toISOString() })).data,
};
