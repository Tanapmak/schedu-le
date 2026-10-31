import { useEffect, useState } from 'react';
import { api, AuthError, devUser, setDevUser, type Me, type Person, type Role, type Room } from './api';
import { Board } from './Board';
import { HoursPage, MyHoursCard } from './Hours';
import { LeavePage } from './LeavePage';
import { MySchedule } from './MySchedule';
import { initialLang, languageLabel, languages, t, type Lang, type StringKey } from './i18n';

const pages: StringKey[] = ['schedule', 'mySchedule', 'leave', 'hours', 'results'];
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
    <div className="shell">
      <header className="topbar">
        <span className="brand">Schedu-le</span>
        <nav>
          {pages.map((p) => (
            <button key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>
              {t(lang, p)}
            </button>
          ))}
        </nav>
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
          </div>
        )}
        <div className="lang" role="group" aria-label="Language">
          {languages.map((l) => (
            <button key={l} className={l === lang ? 'active' : ''} onClick={() => setLang(l)}>
              {languageLabel[l]}
            </button>
          ))}
        </div>
      </header>
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
          <HoursPage lang={lang} user={me.user} />
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
