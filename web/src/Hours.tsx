import { useEffect, useState } from 'react';
import { api, type HoursRow, type User } from './api';
import { t, type Lang, type StringKey } from './i18n';
import { todayBkk } from './time';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
export const thisMonth = () => todayBkk().slice(0, 7);

function KpiBar({ value, kpi }: { value: number; kpi: number }) {
  const pct = kpi > 0 ? Math.min(100, (value / kpi) * 100) : 100;
  return (
    <div className="kpi-bar" role="img" aria-label={`${fmt(value)} / ${kpi}`}>
      <span style={{ width: `${pct}%` }} className={value >= kpi ? 'met' : ''} />
    </div>
  );
}

/** Card on My Schedule: my hours this month against KPI. */
export function MyHoursCard({ lang, user }: { lang: Lang; user: User }) {
  const [row, setRow] = useState<HoursRow>();
  useEffect(() => {
    api.hours(thisMonth()).then((rows) => setRow(rows.find((r) => r.personId === user.id)), () => undefined);
  }, [user.id]);
  if (!row) return null;
  const left = Math.max(0, row.totalHours - row.doneHours);
  return (
    <section className="stat-card">
      <div className="stat-label">{t(lang, 'myHours')}</div>
      <div className="stat-value">
        {fmt(row.kpiHours !== null ? row.ownRoleHours : row.totalHours)} <small>{t(lang, 'hoursSuffix')}</small>
        {row.kpiHours !== null && <span className="muted stat-of">{t(lang, 'ofKpi').replace('{kpi}', String(row.kpiHours))}</span>}
      </div>
      {row.kpiHours !== null && <KpiBar value={row.ownRoleHours} kpi={row.kpiHours} />}
      <div className="muted stat-sub">
        {t(lang, 'scheduledLeft').replace('{done}', fmt(row.doneHours)).replace('{left}', fmt(left))}
        {row.crossRoleHours > 0 && ` · ${t(lang, 'crossRole')} ${fmt(row.crossRoleHours)}`}
      </div>
    </section>
  );
}

export function HoursPage({ lang, user, exportButton }: { lang: Lang; user: User; exportButton?: (month: string) => React.ReactNode }) {
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState<HoursRow[]>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setRows(undefined);
    setFailed(false);
    api.hours(month).then(setRows, () => setFailed(true));
  }, [month]);

  const kpiRows = (rows ?? []).filter((r) => r.kpiHours !== null);
  const otherRows = (rows ?? []).filter((r) => r.kpiHours === null);
  const pos = (r: HoursRow) => (r.position === 'operation' ? 'OP' : r.position.toUpperCase());

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t(lang, 'hours')}</h1>
        <div className="inline-form">
          <label className="inline">
            {t(lang, 'month')}
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </label>
          {user.role === 'admin' && exportButton?.(month)}
        </div>
      </div>
      <p className="hint">{t(lang, 'kpiHint')}</p>
      {failed && <p className="error">{t(lang, 'loadFailed')}</p>}
      {!rows && !failed && <p className="muted">{t(lang, 'loading')}</p>}

      {kpiRows.length > 0 && (
        <section>
          <h2>{t(lang, 'kpiStaff')}</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t(lang, 'person')}</th>
                  <th>{t(lang, 'position')}</th>
                  <th className="num">{t(lang, 'ownRole')}</th>
                  <th className="bar-col">{t(lang, 'kpi')}</th>
                  <th className="num">{t(lang, 'vsKpi')}</th>
                  <th className="num">{t(lang, 'crossRole')}</th>
                  <th className="num">{t(lang, 'total')}</th>
                  <th className="num">{t(lang, 'done')}</th>
                  <th className="num">{t(lang, 'sessionsCount')}</th>
                </tr>
              </thead>
              <tbody>
                {kpiRows.map((r) => (
                  <tr key={r.personId} className={r.personId === user.id ? 'mine' : ''}>
                    <td>{r.nickname}</td>
                    <td>{pos(r)}</td>
                    <td className="num">{fmt(r.ownRoleHours)}</td>
                    <td className="bar-col">
                      <KpiBar value={r.ownRoleHours} kpi={r.kpiHours!} />
                      <small className="muted">{r.kpiHours}</small>
                    </td>
                    <td className={`num ${r.vsKpi! >= 0 ? 'pos' : 'neg'}`}>{signed(r.vsKpi!)}</td>
                    <td className="num">{r.crossRoleHours ? fmt(r.crossRoleHours) : '–'}</td>
                    <td className="num">{fmt(r.totalHours)}</td>
                    <td className="num">{fmt(r.doneHours)}</td>
                    <td className="num">{r.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {otherRows.length > 0 && (
        <section>
          <h2>{t(lang, 'noKpiStaff')}</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t(lang, 'person')}</th>
                  <th>{t(lang, 'employment')}</th>
                  <th className="num">MC</th>
                  <th className="num">PD</th>
                  <th className="num">{t(lang, 'total')}</th>
                  <th className="num">{t(lang, 'sessionsCount')}</th>
                </tr>
              </thead>
              <tbody>
                {otherRows.map((r) => (
                  <tr key={r.personId} className={r.personId === user.id ? 'mine' : ''}>
                    <td>{r.nickname}</td>
                    <td>
                      {t(lang, `emp_${r.employment}` as StringKey)} · {pos(r)}
                    </td>
                    <td className="num">{fmt(r.mcHours)}</td>
                    <td className="num">{fmt(r.pdHours)}</td>
                    <td className="num">{fmt(r.totalHours)}</td>
                    <td className="num">{r.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
