import { useEffect, useState } from 'react';
import { api, isManager, type TeamPreference, type User } from './api';
import { t, type Lang } from './i18n';

const MAX = 2000;

/** Everyone writes how they'd like to be scheduled; the AI planner and the admin read it. */
export function PreferencesPage({ lang, user }: { lang: Lang; user: User }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState<{ text: string; at: string | null }>();
  const [busy, setBusy] = useState(false);
  const [team, setTeam] = useState<TeamPreference[]>();
  const manager = isManager(user.role);

  useEffect(() => {
    void api.myPreference().then((p) => (setText(p.text), setSaved({ text: p.text, at: p.updatedAt })));
    if (manager) void api.preferences().then(setTeam);
  }, [manager]);

  async function save() {
    setBusy(true);
    try {
      if (await api.saveMyPreference(text)) {
        setSaved({ text: text.trim(), at: new Date().toISOString() });
        if (manager) setTeam(await api.preferences());
      }
    } finally {
      setBusy(false);
    }
  }

  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : lang === 'zh' ? 'zh-CN' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  const dirty = saved !== undefined && text.trim() !== saved.text;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t(lang, 'prefsTitle')}</h1>
          <p className="sub">{t(lang, 'prefsHint')}</p>
        </div>
      </div>

      <section className="card prefs-card">
        <textarea rows={6} maxLength={MAX} value={text} placeholder={t(lang, 'prefsPlaceholder')} onChange={(e) => setText(e.target.value)} />
        <div className="row-actions">
          <span className="hint">
            {saved?.at && `${t(lang, 'prefsSavedAt').replace('{t}', when(saved.at))} · `}
            {text.length}/{MAX}
          </span>
          <button className="primary" disabled={busy || !dirty} onClick={() => void save()}>
            {t(lang, 'saveBtn')}
          </button>
        </div>
      </section>

      {manager && (
        <section className="card">
          <h2>{t(lang, 'prefsTeam')}</h2>
          {team === undefined ? (
            <p className="muted">{t(lang, 'loading')}</p>
          ) : team.length === 0 ? (
            <p className="muted">{t(lang, 'prefsNone')}</p>
          ) : (
            <ul className="prefs-list">
              {team.map((p) => (
                <li key={p.personId}>
                  <strong>{p.nickname}</strong> <span className="hint">{when(p.updatedAt)}</span>
                  <p>{p.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
