// The team works in Bangkok time (UTC+7, no daylight saving), whatever the browser's zone.
const OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** YYYY-MM-DD of an instant, in Bangkok. */
export const bkkDate = (d: Date) => new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);

/** HH:mm of an instant, in Bangkok. */
export const bkkTime = (d: Date) => new Date(d.getTime() + OFFSET_MS).toISOString().slice(11, 16);

/** Instant for a Bangkok date and HH:mm. "24:00" and later roll into the next day. */
export function bkkInstant(date: string, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  return new Date(Date.parse(`${date}T00:00:00+07:00`) + (h * 60 + m) * 60_000);
}

export const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Monday of the week containing a date. */
export function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

export const todayBkk = () => bkkDate(new Date());

/** Minutes since midnight of `date` (Bangkok), can exceed 1440 for after-midnight lives. */
export const minutesFrom = (date: string, d: Date) => (d.getTime() - Date.parse(`${date}T00:00:00+07:00`)) / 60_000;

export const hoursBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

const locales = { th: 'th-TH', en: 'en-GB', zh: 'zh-CN' } as const;

export function formatDay(date: string, lang: keyof typeof locales, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locales[lang], { timeZone: 'UTC', ...opts }).format(new Date(`${date}T00:00:00Z`));
}
