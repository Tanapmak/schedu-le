import { useCallback, useEffect, useState } from 'react';
import { api, type Holiday, type LeaveRequest, type Person, type Room, type SwapRequest, type User } from './api';
import { t, type Lang } from './i18n';
import { LeaveForm } from './LeaveForm';
import { RequestList } from './Requests';
import { addDays, bkkInstant, todayBkk } from './time';
import { periodLabel } from './ui';

interface Props {
  lang: Lang;
  user: User;
  people: Person[];
  rooms: Room[];
}

/** Admin: approval queue, team off days and all leave. Team: their own requests. */
export function LeavePage({ lang, user, people, rooms }: Props) {
  const isAdmin = user.role === 'admin';
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(() => {
    const from = bkkInstant(todayBkk(), '00:00');
    void Promise.all([
      api.leave(),
      api.swaps(),
      api.board(from, bkkInstant(addDays(todayBkk(), 60), '00:00')),
    ]).then(([l, s, b]) => {
      setLeave(l);
      setSwaps(s);
      setHolidays(b.holidays);
    });
  }, []);
  useEffect(load, [load]);

  const pendingLeave = leave.filter((l) => l.status === 'pending');
  const pendingSwaps = swaps.filter((s) => s.status === 'pending');
  const decided = { leave: leave.filter((l) => l.status !== 'pending'), swaps: swaps.filter((s) => s.status !== 'pending') };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t(lang, 'leave')}</h1>
        <button className="primary" onClick={() => setFormOpen(true)}>
          {t(lang, 'requestLeave')}
        </button>
      </div>

      {isAdmin ? (
        <>
          <section>
            <h2>
              {t(lang, 'approvals')} {pendingLeave.length + pendingSwaps.length > 0 && <span className="badge">{pendingLeave.length + pendingSwaps.length}</span>}
            </h2>
            <RequestList lang={lang} user={user} people={people} rooms={rooms} leave={pendingLeave} swaps={pendingSwaps} decide onChanged={load} />
          </section>
          <OffDays lang={lang} holidays={holidays} onChanged={load} />
          <section>
            <h2>{t(lang, 'allLeave')}</h2>
            <RequestList lang={lang} user={user} people={people} rooms={rooms} leave={decided.leave} swaps={decided.swaps} onChanged={load} />
          </section>
        </>
      ) : (
        <>
          <section>
            <h2>{t(lang, 'myRequests')}</h2>
            <RequestList lang={lang} user={user} people={people} rooms={rooms} leave={leave} swaps={swaps} onChanged={load} />
          </section>
          {holidays.length > 0 && (
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
        </>
      )}

      {formOpen && (
        <LeaveForm
          lang={lang}
          user={user}
          people={people}
          rooms={rooms}
          onClose={() => setFormOpen(false)}
          onSaved={() => (setFormOpen(false), load())}
        />
      )}
    </div>
  );
}

function OffDays({ lang, holidays, onChanged }: { lang: Lang; holidays: Holiday[]; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState(addDays(todayBkk(), 7));
  const [to, setTo] = useState(addDays(todayBkk(), 7));
  const [notice, setNotice] = useState('');

  async function add() {
    const out = await api.addHoliday(name.trim(), bkkInstant(from, '00:00').toISOString(), bkkInstant(addDays(to < from ? from : to, 1), '00:00').toISOString());
    setNotice(out.sessionsOnDay?.length ? t(lang, 'offDaySessions').replace('{n}', String(out.sessionsOnDay.length)) : '');
    setName('');
    onChanged();
  }

  async function remove(h: Holiday) {
    if (!window.confirm(`${t(lang, 'remove')} ${h.name}?`)) return;
    await api.removeHoliday(h.id);
    onChanged();
  }

  return (
    <section>
      <h2>{t(lang, 'teamOffDays')}</h2>
      <p className="hint">{t(lang, 'teamOffHint')}</p>
      <div className="inline-form">
        <input placeholder={t(lang, 'offDayName')} value={name} onChange={(e) => setName(e.target.value)} />
        <input type="date" aria-label={t(lang, 'fromDate')} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span>–</span>
        <input type="date" aria-label={t(lang, 'toDate')} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        <button className="primary" disabled={!name.trim()} onClick={add}>
          {t(lang, 'addOffDay')}
        </button>
      </div>
      {notice && <p className="warning-text">{notice}</p>}
      <ul className="off-days">
        {holidays.map((h) => (
          <li key={h.id}>
            <strong>{periodLabel(lang, h.start, h.end)}</strong> {h.name}
            <button className="link danger-link" onClick={() => remove(h)}>
              {t(lang, 'remove')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
