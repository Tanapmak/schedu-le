import type { StaffAssignment } from './rules/index.js';
import type { OffsitePlace, SessionInput } from './store.js';

export class BadRequest extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function parseDate(v: unknown, field: string): Date {
  const d = typeof v === 'string' ? new Date(v) : undefined;
  if (!d || Number.isNaN(d.getTime())) throw new BadRequest(`${field} must be an ISO date-time`);
  return d;
}

export function parseId(v: unknown, field: string): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) throw new BadRequest(`${field} must be a positive integer`);
  return n;
}

export function parseSessionInput(body: unknown): SessionInput {
  if (!isObject(body)) throw new BadRequest('body must be an object');
  const staff = body.staff ?? [];
  if (!Array.isArray(staff)) throw new BadRequest('staff must be an array');
  const location = body.location;
  if (location !== undefined && location !== 'studio' && location !== 'offsite' && location !== 'home') throw new BadRequest('bad location');
  return {
    roomId: parseId(body.roomId, 'roomId'),
    start: parseDate(body.start, 'start'),
    end: parseDate(body.end, 'end'),
    location,
    offsite: location === 'offsite' ? parseOffsite(body.offsite) : null,
    note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
    staff: staff.map((s, i): StaffAssignment => {
      if (!isObject(s) || (s.role !== 'mc' && s.role !== 'pd')) throw new BadRequest(`staff[${i}].role must be mc or pd`);
      return { personId: parseId(s.personId, `staff[${i}].personId`), role: s.role, replaced: s.replaced === true };
    }),
  };
}


/** An off-site place: a name, coordinates, and how close (metres) counts as being there. */
export function parseOffsite(v: unknown): OffsitePlace {
  if (!isObject(v)) throw new BadRequest('offsite place needed');
  const name = typeof v.name === 'string' ? v.name.trim().slice(0, 120) : '';
  const lat = Number(v.lat);
  const lng = Number(v.lng);
  const radiusM = v.radiusM === undefined || v.radiusM === null ? 300 : Math.round(Number(v.radiusM));
  if (!name) throw new BadRequest('offsite.name needed');
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new BadRequest('offsite.lat/lng must be coordinates');
  }
  if (!Number.isFinite(radiusM) || radiusM < 20 || radiusM > 5000) throw new BadRequest('offsite.radiusM must be 20-5000');
  return { name, lat, lng, radiusM };
}
