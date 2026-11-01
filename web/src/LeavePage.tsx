import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Holiday, type LeaveRequest, type Person, type Room, type SwapRequest, type User } from './api';
import { t, type Lang } from './i18n';
import { LeaveForm } from './LeaveForm';
import { RequestList } from './Requests';
import { addDays, bkkDate, bkkInstant, formatDay, todayBkk } from './time';
import { periodLabel, Tabs } from './ui';

interface Props {
  lang: Lang;
  user: User;
  people: Person[];
  rooms: Room[];
}

type StatusTab = 'pending' | 'approved' | 'all';
const ALL_DAYS = 'all';

/** Bangkok dates a request touches: every day of a leave (up to a month), or the swapped session's day. */
function daysOf(item: { type: 'leave'; l: LeaveRequest } | { type: 'swap'; s: SwapRequest }): string[] {
  if (item.type === 'swap') return [bkkDate(new Date(item.s.session.start))];
  const first = bkkDate(new Date(item.l.start));
  const last = bkkDate(new Date(new Date(item.l.end).getTime() - 1));
  const out: string[] = [];
  for (let d = first; d <= last && out.length < 31; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Leave and swap requests in tabs by status, then by date. The admin approves here. */
export function LeavePage({ lang, user, people, rooms }: Props) {
  const isAdmin = user.role === 'admin';
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [tab, setTab] = useState<StatusTab>('pending');
  const [day, setDay] = useState<string>(ALL_DAYS);

  const load = useCallback(() => {
    const from = bkkInstant(todayBkk(), '00:00');
    void Promise.all([api.leave(), api.swaps(), api.holidays(from, bkkInstant(addDays(todayBkk(), 90), '00:00'))]).then(([l, s, h]) => {
      setLeave(l);
      setSwaps(s);
      setHolidays(h);
    });
  }, []);
  useEffect(load, [load]);

  const inTab = (status: string) => (tab === 'all' ? true : status === tab);
  const tabLeave = leave.filter((l) => inTab(l.status));
  const tabSwaps = swaps.filter((s) => inTab(s.status));
  const pendingCount = leave.filter((l) => l.status === 'pending').length + swaps.filter((s) => s.status === 'pending').length;

  // Date tabs: each day that has a request in this status tab, with how many MC / PD are off.
  const dates = useMemo(() => {
    const map = new Map<string, { mc: number; pd: number; n: number }>();
    const bump = (d: string, pos?: string) => {
      const x = map.get(d) ?? { mc: 0, pd: 0, n: 0 };
      x.n += 1;
      if (pos === 'mc') x.mc += 1;
      if (pos === 'pd') x.pd += 1;
      map.set(d, x);
    };
    for (const l of tabLeave) for (const d of daysOf({ type: 'leave', l })) bump(d, people.find((p) => p.id === l.personId)?.position);
    for (const s of tabSwaps) for (const d of daysOf({ type: 'swap', s })) bump(d);
    return [...map].sort(([a], [b]) => a.localeCompare(b));
  }, [tabLeave, tabSwaps, people]);

  const selected = day !== ALL_DAYS && dates.some(([d]) => d === day) ? day : ALL_DAYS;
  const shownLeave = selected === ALL_DAYS ? tabLeave : tabLeave.filter((l) => daysOf({ type: 'leave', l }).includes(selected));
  const shownSwaps = selected === ALL_DAYS ? tabSwaps : tabSwaps.filter((s) => daysOf({ type: 'swap', s }).includes(selected));
  const quota = (n: number) => (n >= 2 ? ' full' : '');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t(lang, 'leave')}</h1>
          <p className="sub">{t(lang, 'leaveRulesHint')}</p>
        </div>
        <div className="head-actions">
          <Tabs
            value={tab}
            onChange={(k) => (setTab(k), setDay(ALL_DAYS))}
            tabs={[
              { key: 'pending', label: `${t(lang, 'tabPending')}${pendingCount ? ` (${pendingCount})` : ''}` },
              { key: 'approved', label: t(lang, 'tabApproved') },
              { key: 'all', label: t(lang, 'tabAll') },
            ]}
          />
          <button className="primary" onClick={() => setFormOpen(true)}>
            {t(lang, 'requestLeave')}
          </button>
        </div>
      </div>

      {dates.length > 0 && (
        <div className="date-tabs" role="tablist">
          <button role="tab" aria-selected={selected === ALL_DAYS} className={selected === ALL_DAYS ? 'active' : ''} onClick={() => setDay(ALL_DAYS)}>
            <strong>{t(lang, 'allDates')}</strong>
            <small>{tabLeave.length + tabSwaps.length}</small>
          </button>
          {dates.map(([d, c]) => (
            <button key={d} role="tab" aria-selected={selected === d} className={`${selected === d ? 'active' : ''}${quota(Math.max(c.mc, c.pd))}`} onClick={() => setDay(d)}>
              <strong>{formatDay(d, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
              <small>
                {c.mc > 0 && `MC ${c.mc}`}
                {c.mc > 0 && c.pd > 0 && ' · '}
                {c.pd > 0 && `PD ${c.pd}`}
                {c.mc === 0 && c.pd === 0 && `${c.n}`}
              </small>
            </button>
          ))}
        </div>
      )}

      <RequestList
        lang={lang}
        user={user}
        people={people}
        rooms={rooms}
        leave={shownLeave}
        swaps={shownSwaps}
        decide={isAdmin}
        cards
        onChanged={load}
      />

      {!isAdmin && holidays.length > 0 && (
        <section>
          <h2>{t(lang, 'teamOffDays')}</h2>
          <ul className="off-days">
            {holidays.map((h) => (
              <li key={h.id}>
                <strong>{periodLabel(lang, h.start, h.end)}</strong> {h.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {formOpen && (
        <LeaveForm lang={lang} user={user} people={people} rooms={rooms} onClose={() => setFormOpen(false)} onSaved={() => (setFormOpen(false), load())} />
      )}
    </div>
  );
}
