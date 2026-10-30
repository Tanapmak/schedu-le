import { useEffect, useState } from 'react';
import { initialLang, languageLabel, languages, t, type Lang, type StringKey } from './i18n';

const pages: StringKey[] = ['schedule', 'mySchedule', 'leave', 'hours', 'results'];
type Health = 'checking' | 'ok' | 'down';

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [page, setPage] = useState<StringKey>('schedule');
  const [health, setHealth] = useState<Health>('checking');

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
        <h1>{t(lang, page)}</h1>
        <p>{t(lang, 'comingSoon')}</p>
        <p className={`health ${health}`}>{t(lang, healthKey)}</p>
      </main>
    </div>
  );
}
