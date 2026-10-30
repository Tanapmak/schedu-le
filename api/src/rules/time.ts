// Thailand has no daylight saving, so Bangkok time is always UTC+7.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export interface Interval {
  start: Date;
  end: Date; // exclusive, like Postgres tstzrange '[)'
}

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

export const hoursOf = (i: Interval) => (i.end.getTime() - i.start.getTime()) / HOUR_MS;

/** Calendar date in Bangkok, as YYYY-MM-DD. */
export const bangkokDate = (d: Date) => new Date(d.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);

/** Month in Bangkok, as YYYY-MM. Hours count toward the month the session starts in. */
export const bangkokMonth = (d: Date) => bangkokDate(d).slice(0, 7);

/** Every Bangkok calendar date an interval touches. */
export function bangkokDates(i: Interval): string[] {
  const dates: string[] = [];
  const last = bangkokDate(new Date(i.end.getTime() - 1));
  for (let d = bangkokDate(i.start); d <= last; d = nextDate(d)) dates.push(d);
  return dates;
}

function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
