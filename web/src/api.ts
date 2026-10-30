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
  isActive: boolean;
  maxHours: number | null;
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

async function request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status >= 500) throw new Error(`${method} ${path}: ${res.status}`);
  return { status: res.status, data: (await res.json()) as T };
}

export const api = {
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
  publish: async (from: Date, to: Date) =>
    (await request<{ published: number }>('POST', '/api/publish', { from: from.toISOString(), to: to.toISOString() })).data,
};
