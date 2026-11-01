import { useCallback, useEffect, useState } from 'react';
import { api, type LeaveRequest, type Person, type Holiday, type Room, type Session, type SwapRequest, type User } from './api';
import { t, type Lang } from './i18n';
import { LeaveForm } from './LeaveForm';
import { RequestList } from './Requests';
import { SwapForm } from './SwapForm';
import { StatusPill, Tabs } from './ui';
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
  const [tab, setTab] = useState<'upcoming' | 'requests'>('upcoming');
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  const load = useCallback(() => {
    const from = bkkInstant(todayBkk(), '00:00');
    const to = bkkInstant(addDays(todayBkk(), WEEKS_AHEAD * 7), '00:00');
    setFailed(false);
    Promise.all([api.board(from, to), api.leave({ mine: true }), api.swaps({ mine: true })]).then(([b, l, s]) => {
      setSessions(b.sessions.filter((x) => x.status === 'published' && new Date(x.end).getTime() > Date.now()));
      setHolidays(b.holidays);
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

  const next = mine.find((s) => new Date(s.end).getTime() > Date.now());
  const pendingRequests = leave.filter((l) => l.status === 'pending').length + swaps.filter((s) => s.status === 'pending').length;
  const holidayOn = (day: string) =>
    holidays.find((h) => new Date(h.start) < bkkInstant(addDays(day, 1), '00:00') && new Date(h.end) > bkkInstant(day, '00:00'));

  return (
    <div className="page my-page">
      <div className="page-head">
        <div>
          <p className="sub">{t(lang, 'hello')}</p>
          <h1>{user.nickname}</h1>
        </div>
      </div>

      {next && <NextLive lang={lang} session={next} meId={user.id} nameOf={nameOf} codeOf={codeOf} onSwap={() => setSwapFor(next)} swapPending={pendingSwap.has(next.id)} />}
      {children}

      <Tabs
        className="wide"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'upcoming', label: t(lang, 'upcoming') },
          { key: 'requests', label: `${t(lang, 'myRequests')}${pendingRequests ? ` (${pendingRequests})` : ''}` },
        ]}
      />

      {tab === 'upcoming' ? (
        <section>
          {failed && <p className="error">{t(lang, 'loadFailed')}</p>}
          {!sessions && !failed && <p className="muted">{t(lang, 'loading')}</p>}
          {sessions && mine.length === 0 && <p className="muted">{t(lang, 'noUpcoming')}</p>}
          <ul className="day-cards">
            {[...byDay].map(([day, list]) =>
              list.map((s, i) => {
                const role = s.staff.find((x) => x.personId === user.id)?.role ?? 'mc';
                const partners = s.staff.filter((x) => x.personId !== user.id && !x.replaced).map((x) => nameOf(x.personId));
                const start = new Date(s.start);
                const l = leaveOn(day);
                return (
                  <li key={s.id} className={`${l ? 'on-leave' : ''}${s.id === next?.id ? ' is-next' : ''}`}>
                    <div className="day-badge">
                      {i === 0 && (
                        <>
                          <small>{formatDay(day, lang, { weekday: 'short' })}</small>
                          <strong>{Number(day.slice(8))}</strong>
                        </>
                      )}
                    </div>
                    <div className="day-body">
                      <strong>
                        {bkkTime(start)}–{bkkTime(new Date(s.end))} · {codeOf(s.roomId)} <span className={`role role-${role}`}>{t(lang, role)}</span>
                      </strong>
                      <small className="muted">
                        {hoursBetween(start, new Date(s.end))} {t(lang, 'hoursSuffix')}
                        {partners.length > 0 && ` · ${t(lang, 'with')} ${partners.join(', ')}`}
                      </small>
                      {l && (
                        <small className="leave-note">
                          {t(lang, 'leave')} · <StatusPill lang={lang} status={l.status} />
                        </small>
                      )}
                      {holidayOn(day) && <small className="leave-note">{t(lang, 'holidayLabel')}: {holidayOn(day)!.name}</small>}
                    </div>
                    {start.getTime() > Date.now() && (
                      <button disabled={pendingSwap.has(s.id)} onClick={() => setSwapFor(s)}>
                        {pendingSwap.has(s.id) ? t(lang, 'statusPending') : t(lang, 'requestSwap')}
                      </button>
                    )}
                  </li>
                );
              }),
            )}
          </ul>
        </section>
      ) : (
        <section>
          <RequestList lang={lang} user={user} people={people} rooms={rooms} leave={leave} swaps={swaps} cards onChanged={load} />
        </section>
      )}

      <button className="big-outline" onClick={() => setLeaveOpen(true)}>
        {t(lang, 'requestLeave')}
      </button>

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

function NextLive({
  lang,
  session: s,
  meId,
  nameOf,
  codeOf,
  onSwap,
  swapPending,
}: {
  lang: Lang;
  session: Session;
  meId: number;
  nameOf: (id: number) => string;
  codeOf: (id: number) => string;
  onSwap: () => void;
  swapPending: boolean;
}) {
  const start = new Date(s.start);
  const mins = Math.round((start.getTime() - Date.now()) / 60_000);
  const partners = s.staff.filter((x) => x.personId !== meId && !x.replaced).map((x) => nameOf(x.personId));
  const when =
    mins <= 0
      ? t(lang, 'liveNow')
      : mins < 24 * 60
        ? mins < 60
          ? t(lang, 'inMinutes').replace('{m}', String(mins))
          : t(lang, 'inTime').replace('{h}', String(Math.floor(mins / 60))).replace('{m}', String(mins % 60))
        : formatDay(bkkDate(start), lang, { weekday: 'long', day: 'numeric', month: 'short' });
  return (
    <div className="next-live">
      <small>
        {t(lang, 'nextLive')} · {when}
      </small>
      <strong>
        {bkkTime(start)}–{bkkTime(new Date(s.end))}
      </strong>
      <span>
        {codeOf(s.roomId)}
        {partners.length > 0 && ` · ${t(lang, 'with')} ${partners.join(', ')}`}
      </span>
      {start.getTime() > Date.now() && (
        <div className="next-actions">
          <button disabled={swapPending} onClick={onSwap}>
            {swapPending ? t(lang, 'statusPending') : t(lang, 'requestSwap')}
          </button>
        </div>
      )}
    </div>
  );
}
