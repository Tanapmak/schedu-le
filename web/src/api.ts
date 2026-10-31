import type { ViolationLike } from './i18n';

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
  ownRoleHours: number;
  crossRoleHours: number;
  vsKpi: number | null;
}

export type Role = 'admin' | 'mc' | 'pd' | 'viewer';

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
  deleteResult: async (id: number) => (await request<{ ok: boolean }>('DELETE', `/api/results/${id}`)).data,
  publish: async (from: Date, to: Date) =>
    (await request<{ published: number }>('POST', '/api/publish', { from: from.toISOString(), to: to.toISOString() })).data,
};
