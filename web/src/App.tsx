import { useEffect, useState } from 'react';
import { api, AuthError, downloadPayroll, devUser, setDevUser, type Me, type Person, type Role, type Room } from './api';
import { Board } from './Board';
import { HoursPage, MyHoursCard } from './Hours';
import { AttendancePage } from './Attendance';
import { ClockIn } from './ClockIn';
import { LeavePage } from './LeavePage';
import { OffDaysPage } from './OffDays';
import { MySchedule } from './MySchedule';
import { ResultsPage } from './Results';
import { initialLang, languageLabel, languages, t, type Lang, type StringKey } from './i18n';

// Pages each role sees, in nav order. MC/PD get the first four in the phone's bottom bar too.
const adminPages: StringKey[] = ['schedule', 'leave', 'offDays', 'results', 'attendance', 'hours'];
const teamPages: StringKey[] = ['mySchedule', 'clockNav', 'schedule', 'leave', 'results', 'hours'];
const viewerPages: StringKey[] = ['schedule', 'hours'];
const pagesFor = (role?: Role) => (role === 'admin' ? adminPages : role === 'mc' || role === 'pd' ? teamPages : viewerPages);
type Health = 'checking' | 'ok' | 'down';

const roleKey: Record<Role, StringKey> = { admin: 'roleAdmin', mc: 'roleMc', pd: 'rolePd', viewer: 'roleViewer' };

// A dev user saved from an earlier database may no longer exist; fall back to the default once.
async function loadMe(): Promise<Me> {
  try {
    return await api.me();
  } catch (err) {
    if (err instanceof AuthError && err.status === 403 && devUser()) {
      setDevUser('');
      return api.me();
    }
    throw err;
  }
}

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [page, setPage] = useState<StringKey>('schedule');
  const [health, setHealth] = useState<Health>('checking');
  const [rooms, setRooms] = useState<Room[]>();
  const [people, setPeople] = useState<Person[]>();
  const [me, setMe] = useState<Me>();
  const [authError, setAuthError] = useState<AuthError>();
  const [pendingCount, setPendingCount] = useState(0);

  // Waiting requests for the admin's nav badge, refreshed on every page change.
  useEffect(() => {
    if (me?.user.role !== 'admin') return;
    void Promise.all([api.leave({ status: 'pending' }), api.swaps({ status: 'pending' })]).then(
      ([l, s]) => setPendingCount(l.length + s.length),
      () => undefined,
    );
  }, [me, page]);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('lang', lang);
    } catch {
      // storage blocked; the choice just won't persist
    }
  }, [lang]);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setHealth(res.ok ? 'ok' : 'down'))
      .catch(() => setHealth('down'));
    loadMe()
      .then((m) => {
        setMe(m);
        if (m.user.role === 'mc' || m.user.role === 'pd') setPage('mySchedule');
        return Promise.all([api.rooms(), api.people()]);
      })
      .then(
        ([r, p]) => {
          setRooms(r);
          setPeople(p);
        },
        (err) => (err instanceof AuthError ? setAuthError(err) : setHealth('down')),
      );
  }, []);

  const healthKey = health === 'ok' ? 'apiOk' : health === 'down' ? 'apiDown' : 'apiChecking';

  return (
    <div className={`shell${me && pagesFor(me.user.role) === teamPages ? ' has-bottom-nav' : ''}`}>
      <header className="topbar">
        <span className="brand">
          <span className="logo" aria-hidden="true" />
          Schedu-le
        </span>
        <nav className="pills">
          {pagesFor(me?.user.role).map((p) => (
            <button key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>
              {t(lang, p)}
              {p === 'leave' && pendingCount > 0 && <span className="count">{pendingCount}</span>}
            </button>
          ))}
        </nav>
        <div className="lang" role="group" aria-label="Language">
          {languages.map((l) => (
            <button key={l} className={l === lang ? 'active' : ''} onClick={() => setLang(l)}>
              {languageLabel[l]}
            </button>
          ))}
        </div>
        {me && (
          <div className="whoami">
            {me.mode === 'dev' && me.devUsers ? (
              <label>
                <span className="sr-only">{t(lang, 'viewAs')}</span>
                <select
                  title={t(lang, 'viewAs')}
                  value={me.user.email}
                  onChange={(e) => {
                    setDevUser(e.target.value);
                    window.location.reload();
                  }}
                >
                  {me.devUsers.map((u) => (
                    <option key={u.email} value={u.email}>
                      {u.nickname} · {t(lang, roleKey[u.role])}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span>
                {me.user.nickname} · {t(lang, roleKey[me.user.role])}
              </span>
            )}
            <span className="avatar" aria-hidden="true">
              {me.user.nickname.slice(0, 1)}
            </span>
          </div>
        )}
      </header>
      {me && pagesFor(me.user.role) === teamPages && (
        <nav className="bottom-nav">
          {teamPages.slice(0, 4).map((p) => (
            <button key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>
              <span className={`ico ico-${p}`} aria-hidden="true" />
              {t(lang, p === 'schedule' ? 'wholeTeam' : p)}
            </button>
          ))}
        </nav>
      )}
      <main>
        {authError ? (
          <p className="error">
            {authError.status === 403 ? t(lang, 'notRegistered').replace('{email}', authError.email ?? '') : t(lang, 'notSignedIn')}
          </p>
        ) : page === 'schedule' && rooms && people && me ? (
          <Board lang={lang} rooms={rooms} people={people} user={me.user} />
        ) : page === 'mySchedule' && rooms && people && me ? (
          <MySchedule lang={lang} rooms={rooms} people={people} user={me.user}>
            <MyHoursCard lang={lang} user={me.user} />
          </MySchedule>
        ) : page === 'hours' && me ? (
          <HoursPage
            lang={lang}
            user={me.user}
            exportButton={(month) => (
              <button className="primary" title={t(lang, 'exportHint')} onClick={() => downloadPayroll(month)}>
                {t(lang, 'exportPayroll')}
              </button>
            )}
          />
        ) : page === 'results' && rooms && people && me ? (
          <ResultsPage lang={lang} rooms={rooms} people={people} user={me.user} aiReader={Boolean(me.aiReader)} />
        ) : page === 'offDays' && me?.user.role === 'admin' ? (
          <OffDaysPage lang={lang} />
        ) : page === 'attendance' && people && rooms && me?.user.role === 'admin' ? (
          <AttendancePage lang={lang} people={people} rooms={rooms} />
        ) : page === 'clockNav' && rooms && me ? (
          <ClockIn lang={lang} rooms={rooms} />
        ) : page === 'leave' && rooms && people && me ? (
          <LeavePage lang={lang} rooms={rooms} people={people} user={me.user} />
        ) : (
          <>
            <h1>{t(lang, page)}</h1>
            <p>{page === 'schedule' ? t(lang, 'loading') : t(lang, 'comingSoon')}</p>
          </>
        )}
        {health === 'down' && <p className="health down">{t(lang, healthKey)}</p>}
      </main>
    </div>
  );
}
