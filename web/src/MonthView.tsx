import type { Board as BoardData, Room, Session } from './api';
import { leaveHit } from './Board';
import { t, type Lang } from './i18n';
import { addDays, bkkDate, bkkInstant, formatDay, hoursBetween, mondayOf, todayBkk, liveDate } from './time';

/** Monday-start weeks covering the month of `date` (35 or 42 days). */
export function monthGrid(date: string): string[] {
  const first = `${date.slice(0, 7)}-01`;
  const start = mondayOf(first);
  const nextMonth = addMonths(first, 1);
  const out: string[] = [];
  for (let d = start; d < nextMonth || out.length % 7 !== 0; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Same day of month, `n` months later (clamped to the month's last day). */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

interface DayInfo {
  sessions: Session[];
  hours: number;
  roomsUsed: Set<number>;
  needCover: number;
  noPd: number;
  drafts: number;
  leaveIds: number[];
  holiday?: string;
}

interface Props {
  lang: Lang;
  month: string; // YYYY-MM
  days: string[];
  rooms: Room[];
  data: BoardData;
  nameOf: (id: number) => string;
  selected: string;
  onSelect: (d: string) => void;
  onOpenDay: (d: string) => void;
  /** The summary panel toggle in the toolbar; off hides the side panel. */
  showPanel?: boolean;
}

export function MonthView({ lang, month, days, rooms, data, nameOf, selected, onSelect, onOpenDay, showPanel = true }: Props) {
  const roomOf = (id: number) => rooms.find((r) => r.id === id);
  const overlaps = (day: string, x: { start: string; end: string }) =>
    new Date(x.start) < bkkInstant(addDays(day, 1), '00:00') && new Date(x.end) > bkkInstant(day, '00:00');

  const info = new Map<string, DayInfo>();
  for (const day of days) {
    const sessions = data.sessions.filter((s) => s.status !== 'cancelled' && liveDate(new Date(s.start)) === day);
    info.set(day, {
      sessions,
      hours: Math.round(sessions.reduce((n, s) => n + hoursBetween(new Date(s.start), new Date(s.end)), 0) * 10) / 10,
      roomsUsed: new Set(sessions.map((s) => s.roomId)),
      needCover: sessions.filter((s) => leaveHit(s, data.leaves)?.status === 'approved').length,
      noPd: sessions.filter((s) => {
        const r = roomOf(s.roomId);
        return r?.roomType === 'live' && r.requiresPd && !s.staff.some((x) => x.role === 'pd' && !x.replaced);
      }).length,
      drafts: sessions.filter((s) => s.status === 'draft').length,
      leaveIds: [...new Set(data.leaves.filter((l) => overlaps(day, l)).map((l) => l.personId))],
      holiday: data.holidays.find((h) => overlaps(day, h))?.name,
    });
  }

  const inMonth = days.filter((d) => d.startsWith(month));
  const monthInfo = inMonth.map((d) => info.get(d)!);
  const total = monthInfo.reduce((n, x) => n + x.sessions.length, 0);
  const unplanned = monthInfo.filter((x) => !x.holiday && x.sessions.length === 0).length;
  const issues = monthInfo.reduce((n, x) => n + x.needCover + x.noPd, 0);
  const drafts = monthInfo.reduce((n, x) => n + x.drafts, 0);
  const sel = info.get(selected);
  const weekdays = days.slice(0, 7).map((d) => formatDay(d, lang, { weekday: 'short' }));
  const today = todayBkk();

  return (
    <div className={`month-layout${showPanel ? '' : ' no-panel'}`}>
      <div className="month-grid" role="grid">
        {weekdays.map((w) => (
          <div key={w} className="month-head">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const x = info.get(d)!;
          const out = !d.startsWith(month);
          const cls = ['month-cell', out ? 'out' : '', x.holiday ? 'holiday' : '', d === selected ? 'selected' : '', d === today ? 'today' : ''].join(' ');
          return (
            <button key={d} className={cls} onClick={() => onSelect(d)} onDoubleClick={() => onOpenDay(d)}>
              <span className="mc-top">
                <strong>{Number(d.slice(8))}</strong>
                {!out && x.hours > 0 && (
                  <small>
                    {x.hours} {t(lang, 'hoursSuffix')}
                  </small>
                )}
              </span>
              {!out &&
                (x.holiday ? (
                  <span className="mc-line">{x.holiday}</span>
                ) : (
                  <>
                    <span className="mc-line">{x.sessions.length ? `${x.sessions.length} ${t(lang, 'sessionsUnit')}` : t(lang, 'notPlanned')}</span>
                    <span className="mc-rooms" aria-hidden="true">
                      {rooms.map((r) => (
                        <i key={r.id} className={x.roomsUsed.has(r.id) ? 'on' : ''} />
                      ))}
                    </span>
                    <span className="mc-badges">
                      {x.needCover > 0 && <span className="mb hot">{t(lang, 'coverShort')} {x.needCover}</span>}
                      {x.noPd > 0 && <span className="mb hot">{t(lang, 'noPdShort')} {x.noPd}</span>}
                      {x.drafts > 0 && <span className="mb draft">Draft {x.drafts}</span>}
                      {x.leaveIds.length > 0 && <span className="mb">{t(lang, 'onLeave')} {x.leaveIds.length}</span>}
                    </span>
                  </>
                ))}
            </button>
          );
        })}
        <p className="month-legend">
          {t(lang, 'monthLegend').replace('{rooms}', rooms.map((r) => r.code).join(', '))}
        </p>
      </div>

      {showPanel && (
        <aside className="summary-panel">
          {sel && (
            <section className="sp-card outlined">
              <h3>{formatDay(selected, lang, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
              <p className="muted">
                {sel.holiday ?? `${sel.sessions.length} ${t(lang, 'sessionsUnit')} · ${sel.hours} ${t(lang, 'hoursSuffix')}`}
              </p>
              <dl>
                {rooms
                  .filter((r) => sel.roomsUsed.has(r.id))
                  .map((r) => {
                    const list = sel.sessions.filter((s) => s.roomId === r.id);
                    const cover = list.filter((s) => leaveHit(s, data.leaves)?.status === 'approved').length;
                    const noPd = r.roomType === 'live' && r.requiresPd ? list.filter((s) => !s.staff.some((x) => x.role === 'pd' && !x.replaced)).length : 0;
                    return (
                      <div key={r.id} className={cover || noPd ? 'hot' : ''}>
                        <dt>{r.code}</dt>
                        <dd>
                          {list.length} {t(lang, 'sessionsUnit')}
                          {cover > 0 && ` · ${t(lang, 'coverShort')} ${cover}`}
                          {noPd > 0 && ` · ${t(lang, 'noPdShort')} ${noPd}`}
                        </dd>
                      </div>
                    );
                  })}
              </dl>
              {sel.leaveIds.length > 0 && (
                <p className="sp-note">
                  {t(lang, 'onLeave')}: {sel.leaveIds.map(nameOf).join(', ')}
                </p>
              )}
              <button className="sp-open" onClick={() => onOpenDay(selected)}>
                {t(lang, 'openDayView')}
              </button>
            </section>
          )}
          <section className="sp-card gray">
            <h3>{t(lang, 'monthOverview')}</h3>
            <dl>
              <div>
                <dt>{t(lang, 'totalSessions')}</dt>
                <dd>{total}</dd>
              </div>
              <div>
                <dt>{t(lang, 'unplannedDays')}</dt>
                <dd>{unplanned}</dd>
              </div>
              <div className={issues ? 'hot' : ''}>
                <dt>{t(lang, 'issuesCount')}</dt>
                <dd>{issues}</dd>
              </div>
              <div>
                <dt>{t(lang, 'draftCount')}</dt>
                <dd>{drafts}</dd>
              </div>
            </dl>
          </section>
        </aside>
      )}
    </div>
  );
}
