import { useEffect, useState } from 'react';
import { api, type Person, type Room } from './api';
import { Board } from './Board';
import { initialLang, languageLabel, languages, t, type Lang, type StringKey } from './i18n';

const pages: StringKey[] = ['schedule', 'mySchedule', 'leave', 'hours', 'results'];
type Health = 'checking' | 'ok' | 'down';

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [page, setPage] = useState<StringKey>('schedule');
  const [health, setHealth] = useState<Health>('checking');
  const [rooms, setRooms] = useState<Room[]>();
  const [people, setPeople] = useState<Person[]>();

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
    Promise.all([api.rooms(), api.people()]).then(
      ([r, p]) => {
        setRooms(r);
        setPeople(p);
      },
      () => setHealth('down'),
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
        <div className="lang" role="group" aria-label="Language">
          {languages.map((l) => (
            <button key={l} className={l === lang ? 'active' : ''} onClick={() => setLang(l)}>
              {languageLabel[l]}
            </button>
          ))}
        </div>
      </header>
      <main>
        {page === 'schedule' && rooms && people ? (
          <Board lang={lang} rooms={rooms} people={people} />
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
