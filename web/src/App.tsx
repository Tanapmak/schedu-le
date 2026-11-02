import { useEffect, useState } from 'react';
import { api, AuthError, downloadPayroll, devUser, isManager, setDevUser, type Me, type Person, type Role, type Room } from './api';
import { Board } from './Board';
import { HoursPage, MyHoursCard } from './Hours';
import { AttendancePage } from './Attendance';
import { ClockIn } from './ClockIn';
import { LeavePage } from './LeavePage';
import { OffDaysPage } from './OffDays';
import { MySchedule } from './MySchedule';
import { ResultsPage } from './Results';
import { TeamPage } from './Team';
import { initialLang, languageLabel, languages, t, type Lang, type StringKey } from './i18n';

// Pages each role sees, in nav order. MC/PD get the first four in the phone's bottom bar too.
// Operation runs everything the master admin does except the team list.
const operationPages: StringKey[] = ['schedule', 'leave', 'offDays', 'results', 'attendance', 'hours'];
const adminPages: StringKey[] = [...operationPages, 'team'];
const teamPages: StringKey[] = ['mySchedule', 'clockNav', 'schedule', 'leave', 'results', 'hours'];
const viewerPages: StringKey[] = ['schedule', 'hours'];
/** Phone bottom bar: this many pages, then a "More" button for the rest. */
const BOTTOM_SLOTS = 4;
const pagesFor = (role?: Role) =>
  role === 'admin' ? adminPages : role === 'operation' ? operationPages : role === 'mc' || role === 'pd' ? teamPages : viewerPages;
type Health = 'checking' | 'ok' | 'down';

const roleKey: Record<Role, StringKey> = { admin: 'roleAdmin', operation: 'roleOperation', mc: 'roleMc', pd: 'rolePd', viewer: 'roleViewer' };

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
  const [moreOpen, setMoreOpen] = useState(false);
  const [health, setHealth] = useState<Health>('checking');
  const [rooms, setRooms] = useState<Room[]>();
  const [people, setPeople] = useState<Person[]>();
  const [me, setMe] = useState<Me>();
  const [authError, setAuthError] = useState<AuthError>();
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingCorrections, setPendingCorrections] = useState(0);
  const [badgeTick, setBadgeTick] = useState(0);

  // Waiting requests for the admin's nav badge, refreshed on every page change.
  useEffect(() => {
    if (!isManager(me?.user.role)) return;
    void Promise.all([api.leave({ status: 'pending' }), api.swaps({ status: 'pending' }), api.corrections()]).then(
      ([l, s, c]) => (setPendingCount(l.length + s.length), setPendingCorrections(c.filter((x) => x.status === 'pending').length)),
      () => undefined,
    );
  }, [me, page, badgeTick]);

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
              {p === 'attendance' && pendingCorrections > 0 && <span className="count">{pendingCorrections}</span>}
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
            <button className="logout" title={t(lang, 'logout')} onClick={() => signOut(me.mode)}>
              <span aria-hidden="true">⎋</span>
              <span className="logout-label">{t(lang, 'logout')}</span>
            </button>
          </div>
        )}
      </header>
      {me && pagesFor(me.user.role) === teamPages && (
        <nav className="bottom-nav">
          {teamPages.slice(0, BOTTOM_SLOTS).map((p) => (
            <button key={p} className={p === page ? 'active' : ''} onClick={() => (setPage(p), setMoreOpen(false))}>
              <span className={`ico ico-${p}`} aria-hidden="true" />
              {t(lang, p === 'schedule' ? 'wholeTeam' : p)}
            </button>
          ))}
          {/* The rest (live results, hours) sit behind "More", so every page is reachable on a phone. */}
          <button
            className={moreOpen || teamPages.indexOf(page) >= BOTTOM_SLOTS ? 'active' : ''}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <span className="ico ico-more" aria-hidden="true" />
            {teamPages.indexOf(page) >= BOTTOM_SLOTS ? t(lang, page) : t(lang, 'more')}
          </button>
          {moreOpen && (
            <>
              <div className="more-backdrop" onClick={() => setMoreOpen(false)} />
              <div className="more-sheet" role="menu">
                {teamPages.slice(BOTTOM_SLOTS).map((p) => (
                  <button key={p} role="menuitem" className={p === page ? 'active' : ''} onClick={() => (setPage(p), setMoreOpen(false))}>
                    <span className={`ico ico-${p}`} aria-hidden="true" />
                    {t(lang, p)}
                  </button>
                ))}
              </div>
            </>
          )}
        </nav>
      )}
      <main>
        {authError ? (
          <div className="auth-error">
          <p className="error">
            {authError.status === 403 ? t(lang, 'notRegistered').replace('{email}', authError.email ?? '') : t(lang, 'notSignedIn')}
          </p>
            {authError.status === 403 && (
              <button onClick={() => signOut('iap')}>{t(lang, 'switchAccount')}</button>
            )}
          </div>
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
        ) : page === 'offDays' && isManager(me?.user.role) ? (
          <OffDaysPage lang={lang} />
        ) : page === 'attendance' && people && rooms && isManager(me?.user.role) ? (
          <AttendancePage lang={lang} people={people} rooms={rooms} onChanged={() => setBadgeTick((n) => n + 1)} />
        ) : page === 'team' && me?.user.role === 'admin' ? (
          <TeamPage lang={lang} me={me.user} onChanged={() => void api.people().then(setPeople)} />
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

/**
 * Sign out. Behind IAP this clears IAP's login cookie, so the next visit asks Google again
 * (and lets a wrong account be swapped). In dev there is no login: forget the "view as" choice.
 */
function signOut(mode: Me['mode']) {
  if (mode === 'dev') {
    setDevUser('');
    window.location.assign('/');
  } else {
    window.location.assign('/?gcp-iap-mode=CLEAR_LOGIN_COOKIE');
  }
}
