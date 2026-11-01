import { useCallback, useEffect, useState } from 'react';
import { api, type Holiday } from './api';
import { t, type Lang } from './i18n';
import { addDays, bkkInstant, todayBkk } from './time';
import { periodLabel } from './ui';

/** Admin page: team-wide off days. No sessions and no leave can be booked on them. */
export function OffDaysPage({ lang }: { lang: Lang }) {
  const [holidays, setHolidays] = useState<Holiday[]>();
  const [name, setName] = useState('');
  const [from, setFrom] = useState(addDays(todayBkk(), 7));
  const [to, setTo] = useState(addDays(todayBkk(), 7));
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void api.holidays(bkkInstant(addDays(todayBkk(), -180), '00:00'), bkkInstant(addDays(todayBkk(), 200), '00:00')).then(setHolidays);
  }, []);
  useEffect(load, [load]);

  async function add() {
    setBusy(true);
    try {
      const out = await api.addHoliday(name.trim(), bkkInstant(from, '00:00').toISOString(), bkkInstant(addDays(to < from ? from : to, 1), '00:00').toISOString());
      setNotice(out.sessionsOnDay?.length ? t(lang, 'offDaySessions').replace('{n}', String(out.sessionsOnDay.length)) : t(lang, 'offDayAdded'));
      setName('');
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(h: Holiday) {
    if (!window.confirm(`${t(lang, 'remove')} ${h.name}?`)) return;
    await api.removeHoliday(h.id);
    load();
  }

  const now = Date.now();
  const upcoming = (holidays ?? []).filter((h) => new Date(h.end).getTime() > now);
  const past = (holidays ?? []).filter((h) => new Date(h.end).getTime() <= now).reverse();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t(lang, 'teamOffDays')}</h1>
          <p className="sub">{t(lang, 'teamOffHint')}</p>
        </div>
      </div>

      <section className="card">
        <h2>{t(lang, 'addOffDay')}</h2>
        <div className="inline-form">
          <input placeholder={t(lang, 'offDayName')} value={name} onChange={(e) => setName(e.target.value)} />
          <label>
            <span>{t(lang, 'fromDate')}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <span>{t(lang, 'toDate')}</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="primary" disabled={!name.trim() || busy} onClick={add}>
            {t(lang, 'addOffDay')}
          </button>
        </div>
        {notice && <p className="warning-text">{notice}</p>}
      </section>

      <section>
        <h2>{t(lang, 'upcomingOffDays')}</h2>
        {holidays && upcoming.length === 0 && <p className="muted">{t(lang, 'noOffDays')}</p>}
        {upcoming.length > 0 && <OffDayTable lang={lang} rows={upcoming} onRemove={remove} />}
      </section>

      {past.length > 0 && (
        <section>
          <h2>{t(lang, 'pastOffDays')}</h2>
          <OffDayTable lang={lang} rows={past} past />
        </section>
      )}
    </div>
  );
}

const dayCount = (h: Holiday) => Math.max(1, Math.round((Date.parse(h.end) - Date.parse(h.start)) / 86_400_000));

/** Off days as a table on a computer; each row turns into a card on a phone. */
function OffDayTable({ lang, rows, past, onRemove }: { lang: Lang; rows: Holiday[]; past?: boolean; onRemove?: (h: Holiday) => void }) {
  return (
    <div className="table-wrap table-cards">
      <table className={`data${past ? ' past' : ''}`}>
        <thead>
          <tr>
            <th>{t(lang, 'date')}</th>
            <th>{t(lang, 'offDayName')}</th>
            <th className="num">{t(lang, 'daysCol')}</th>
            {onRemove && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.id}>
              <td data-label={t(lang, 'date')}>
                <strong>{periodLabel(lang, h.start, h.end)}</strong>
              </td>
              <td data-label={t(lang, 'offDayName')}>{h.name}</td>
              <td data-label={t(lang, 'daysCol')} className="num">
                {dayCount(h)}
              </td>
              {onRemove && (
                <td className="num">
                  <button className="link danger-link" onClick={() => onRemove(h)}>
                    {t(lang, 'remove')}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
