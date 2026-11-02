import { useEffect, useState } from 'react';
import { api, isManager, type TeamPreference, type User } from './api';
import { t, type Lang } from './i18n';
import { todayBkk } from './time';

const MAX = 2000;

/** "YYYY-MM" plus n months. */
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const locale = (lang: Lang) => (lang === 'th' ? 'th-TH' : lang === 'zh' ? 'zh-CN' : 'en-GB');
const monthName = (month: string, lang: Lang) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString(locale(lang), { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Everyone writes how they'd like to be scheduled, for a given month. Every send is kept so the
 * person can see what they asked before; planners and the AI read the latest one per month.
 */
export function PreferencesPage({ lang, user }: { lang: Lang; user: User }) {
  const thisMonth = todayBkk().slice(0, 7);
  const months = [thisMonth, addMonths(thisMonth, 1), addMonths(thisMonth, 2)];
  const [month, setMonth] = useState(months[1]);
  const [text, setText] = useState('');
  const [history, setHistory] = useState<TeamPreference[]>();
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const manager = isManager(user.role);
  const [teamMonth, setTeamMonth] = useState(months[1]);
  const [team, setTeam] = useState<TeamPreference[]>();

  useEffect(() => {
    void api.myPreferences().then(setHistory);
  }, []);
  useEffect(() => {
    if (manager) void api.preferences(teamMonth).then(setTeam);
  }, [manager, teamMonth]);

  // The entry in use for each month is the newest one (history comes newest first).
  const current = new Map<string, number>();
  for (const e of history ?? []) if (!current.has(e.month)) current.set(e.month, e.id);
  const inUse = history?.find((e) => e.month === month);

  async function send() {
    setBusy(true);
    try {
      if (await api.sendMyPreference(month, text.trim())) {
        setHistory(await api.myPreferences());
        setText('');
        setJustSent(true);
        if (manager) setTeam(await api.preferences(teamMonth));
      }
    } finally {
      setBusy(false);
    }
  }

  const when = (iso: string) => new Date(iso).toLocaleString(locale(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t(lang, 'prefsTitle')}</h1>
          <p className="sub">{t(lang, 'prefsHint')}</p>
        </div>
      </div>

      <section className="card prefs-card">
        <label className="prefs-month">
          <span>{t(lang, 'prefsForMonth')}</span>
          <select value={month} onChange={(e) => (setMonth(e.target.value), setJustSent(false))}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthName(m, lang)}
              </option>
            ))}
          </select>
        </label>
        {inUse && (
          <p className="hint">
            {t(lang, 'prefsInUse')}: “{inUse.text}”{' '}
            <button className="link" onClick={() => (setText(inUse.text), setJustSent(false))}>
              {t(lang, 'prefsEditFrom')}
            </button>
          </p>
        )}
        <textarea
          rows={5}
          maxLength={MAX}
          value={text}
          disabled={history === undefined}
          placeholder={t(lang, 'prefsPlaceholder')}
          onChange={(e) => (setText(e.target.value), setJustSent(false))}
        />
        <div className="row-actions">
          <span className="hint">
            {justSent && <strong className="ok-text">{t(lang, 'prefsSaved')} · </strong>}
            {text.length}/{MAX}
          </span>
          <button className="primary" disabled={busy || !text.trim()} onClick={() => void send()}>
            {t(lang, 'prefsSend')}
          </button>
        </div>
      </section>

      {history && history.length > 0 && (
        <section className="card">
          <h2>{t(lang, 'prefsHistory')}</h2>
          <ul className="prefs-list">
            {history.map((e) => {
              const using = current.get(e.month) === e.id;
              return (
                <li key={e.id} className={using ? '' : 'old'}>
                  <strong>{monthName(e.month, lang)}</strong> <span className="hint">{when(e.createdAt)}</span>{' '}
                  {using && <span className="pill st-ok">{t(lang, 'prefsInUseTag')}</span>}
                  <p>{e.text}</p>
                </li>
              );
            })}
          </ul>
          <p className="hint">{t(lang, 'prefsMineHint')}</p>
        </section>
      )}

      {manager && (
        <section className="card">
          <div className="prefs-team-head">
            <h2>{t(lang, 'prefsTeam')}</h2>
            <select value={teamMonth} onChange={(e) => setTeamMonth(e.target.value)}>
              {[addMonths(thisMonth, -1), ...months].map((m) => (
                <option key={m} value={m}>
                  {monthName(m, lang)}
                </option>
              ))}
            </select>
          </div>
          {team === undefined ? (
            <p className="muted">{t(lang, 'loading')}</p>
          ) : team.length === 0 ? (
            <p className="muted">{t(lang, 'prefsNone')}</p>
          ) : (
            <ul className="prefs-list">
              {team.map((p) => (
                <li key={p.id}>
                  <strong>{p.nickname}</strong> <span className="hint">{when(p.createdAt)}</span>
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
