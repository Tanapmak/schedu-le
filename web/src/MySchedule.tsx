import { useCallback, useEffect, useState } from 'react';
import { api, type LeaveRequest, type Person, type Room, type Session, type SwapRequest, type User } from './api';
import { t, type Lang } from './i18n';
import { LeaveForm } from './LeaveForm';
import { RequestList } from './Requests';
import { SwapForm } from './SwapForm';
import { StatusPill } from './ui';
import { addDays, bkkDate, bkkInstant, bkkTime, formatDay, hoursBetween, todayBkk } from './time';
import type { ReactNode } from 'react';

interface Props {
  lang: Lang;
  user: User;
  people: Person[];
  rooms: Room[];
  /** Extra cards above the list (hours vs KPI). */
  children?: ReactNode;
}

const WEEKS_AHEAD = 4;

export function MySchedule({ lang, user, people, rooms, children }: Props) {
  const [sessions, setSessions] = useState<Session[]>();
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [failed, setFailed] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [swapFor, setSwapFor] = useState<Session>();

  const load = useCallback(() => {
    const from = bkkInstant(todayBkk(), '00:00');
    const to = bkkInstant(addDays(todayBkk(), WEEKS_AHEAD * 7), '00:00');
    setFailed(false);
    Promise.all([api.board(from, to), api.leave({ mine: true }), api.swaps({ mine: true })]).then(([b, l, s]) => {
      setSessions(b.sessions.filter((x) => x.status === 'published'));
      setLeave(l);
      setSwaps(s);
    }, () => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;
  const codeOf = (id: number) => rooms.find((r) => r.id === id)?.code ?? `#${id}`;
  const mine = (sessions ?? []).filter((s) => s.staff.some((x) => x.personId === user.id && !x.replaced));
  const byDay = new Map<string, Session[]>();
  for (const s of mine) {
    const d = bkkDate(new Date(s.start));
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  // My live leave request on a day, if any, so the session can be swapped or covered.
  const leaveOn = (day: string) =>
    leave.find(
      (l) =>
        (l.status === 'pending' || l.status === 'approved') &&
        new Date(l.start) < bkkInstant(addDays(day, 1), '00:00') &&
        new Date(l.end) > bkkInstant(day, '00:00'),
    );
  const pendingSwap = new Set(swaps.filter((s) => s.status === 'pending').map((s) => s.session.id));

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t(lang, 'mySchedule')}</h1>
        <button className="primary" onClick={() => setLeaveOpen(true)}>
          {t(lang, 'requestLeave')}
        </button>
      </div>
      {children}

      <section>
        <h2>{t(lang, 'upcoming')}</h2>
        {failed && <p className="error">{t(lang, 'loadFailed')}</p>}
        {!sessions && !failed && <p className="muted">{t(lang, 'loading')}</p>}
        {sessions && mine.length === 0 && <p className="muted">{t(lang, 'noUpcoming')}</p>}
        {[...byDay].map(([day, list]) => (
          <div key={day} className="my-day">
            <h3>
              {formatDay(day, lang, { weekday: 'long', day: 'numeric', month: 'short' })}
              {leaveOn(day) && <StatusPill lang={lang} status={leaveOn(day)!.status} />}
              {leaveOn(day) && <span className="muted">{t(lang, 'leave')}</span>}
            </h3>
            <ul className="my-sessions">
              {list.map((s) => {
                const role = s.staff.find((x) => x.personId === user.id)?.role ?? 'mc';
                const partners = s.staff.filter((x) => x.personId !== user.id && !x.replaced).map((x) => nameOf(x.personId));
                const start = new Date(s.start);
                return (
                  <li key={s.id}>
                    <span className="time">
                      {bkkTime(start)}–{bkkTime(new Date(s.end))}
                      <small>
                        {hoursBetween(start, new Date(s.end))} {t(lang, 'hoursSuffix')}
                      </small>
                    </span>
                    <span className="room">{codeOf(s.roomId)}</span>
                    <span className={`role role-${role}`}>{t(lang, role)}</span>
                    <span className="partners muted">{partners.length > 0 && `${t(lang, 'with')} ${partners.join(', ')}`}</span>
                    {start.getTime() > Date.now() && (
                      <button disabled={pendingSwap.has(s.id)} onClick={() => setSwapFor(s)}>
                        {pendingSwap.has(s.id) ? t(lang, 'statusPending') : t(lang, 'requestSwap')}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h2>{t(lang, 'myRequests')}</h2>
        <RequestList lang={lang} user={user} people={people} rooms={rooms} leave={leave} swaps={swaps} onChanged={load} />
      </section>

      {leaveOpen && (
        <LeaveForm
          lang={lang}
          user={{ ...user, role: user.role === 'admin' ? 'mc' : user.role }}
          people={people}
          rooms={rooms}
          onClose={() => setLeaveOpen(false)}
          onSaved={() => (setLeaveOpen(false), load())}
        />
      )}
      {swapFor && (
        <SwapForm
          lang={lang}
          user={user}
          people={people}
          rooms={rooms}
          session={swapFor}
          upcoming={sessions ?? []}
          onClose={() => setSwapFor(undefined)}
          onSaved={() => (setSwapFor(undefined), load())}
        />
      )}
    </div>
  );
}
