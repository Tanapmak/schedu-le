import { useEffect, useState } from 'react';
import { api, type LiveSummary, type ResultStatus, type User, isManager } from './api';
import { t, type Lang, type StringKey } from './i18n';
import { thisMonth } from './Hours';
import { bkkDate, bkkTime } from './time';

const money = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n.toLocaleString('en-US', { maximumFractionDigits: 0 }));
const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const statusPill: Record<ResultStatus, string> = {
  recorded: 'st-ok', missing: 'st-bad', late: 'st-alert', upcoming: 'st-muted', cancelled: 'st-muted',
};
const statusKey: Record<ResultStatus, StringKey> = {
  recorded: 'rsRecorded', missing: 'rsMissing', late: 'rsLate', upcoming: 'rsUpcoming', cancelled: 'cancelled',
};

/** Live performance for a month, checked in the app instead of exporting the payroll file. */
export function LivePerformancePage({ lang, user }: { lang: Lang; user: User }) {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<LiveSummary>();
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'missing'>('all');
  const manager = isManager(user.role);

  useEffect(() => {
    setData(undefined);
    setFailed(false);
    api.liveSummary(month).then(setData, () => setFailed(true));
  }, [month]);

  const tot = data?.totals;
  const maxDay = Math.max(1, ...(data?.daily ?? []).map((d) => d.gmv));
  // Last day results can still be recorded (the day before the cut-off), e.g. "24 ธ.ค. 2569".
  const cutoffDay = data
    ? new Date(new Date(data.cutoff).getTime() + 7 * 3_600_000 - 1).toLocaleDateString(lang === 'th' ? 'th-TH' : lang === 'zh' ? 'zh-CN' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '';
  const sessions = (data?.sessions ?? []).filter((s) => filter === 'all' || s.status === 'missing' || s.status === 'late');
  const fines = (data?.byPerson ?? []).reduce((a, p) => a + p.deduction, 0);
  const pending = (data?.byPerson ?? []).reduce((a, p) => a + p.pendingDeduction, 0);

  return (
    <div className="page fill">
      <div className="page-head">
        <div>
          <h1>{t(lang, 'livePerf')}</h1>
          <p className="sub">{t(lang, manager ? 'livePerfHint' : 'livePerfHintMine')}</p>
        </div>
        <div className="inline-form">
          <label className="inline">
            {t(lang, 'month')}
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </label>
        </div>
      </div>
      {failed && <p className="error">{t(lang, 'loadFailed')}</p>}
      {!data && !failed && <p className="muted">{t(lang, 'loading')}</p>}

      {data && tot && (
        <>
          <p className={data.closed ? 'hint' : 'notice-bar'}>
            {t(lang, data.closed ? 'cutoffClosed' : 'cutoffOpen').replace('{date}', cutoffDay).replace('{amount}', String(data.deductionAmount))}
          </p>
          <div className="stat-cards">
            <section className="stat-card">
              <div className="stat-label">GMV ({t(lang, 'screenPreRefund')})</div>
              <div className="stat-value">฿{money(tot.gmv)}</div>
              <div className="muted stat-sub">{money(tot.orders)} {t(lang, 'm_orders')}</div>
            </section>
            <section className="stat-card">
              <div className="stat-label">GMV / {t(lang, 'hoursSuffix')}</div>
              <div className="stat-value">฿{money(tot.hours ? tot.gmv / tot.hours : 0)}</div>
              <div className="muted stat-sub">{one(tot.hours)} {t(lang, 'hoursSuffix')} · {tot.ended}/{tot.sessions} {t(lang, 'sessionsCount')}</div>
            </section>
            <section className="stat-card">
              <div className="stat-label">{t(lang, 'resultsRecorded')}</div>
              <div className="stat-value">
                {tot.recorded}<small>/ {tot.ended}</small>
              </div>
              <div className="muted stat-sub">{t(lang, 'endedSessions')}</div>
            </section>
            <section className="stat-card">
              <div className="stat-label">{t(lang, 'rsMissing')}</div>
              <div className={`stat-value ${tot.missing ? 'neg' : ''}`}>{tot.missing}</div>
              <div className="muted stat-sub">
                {fines > 0 && `${t(lang, 'deducted')} ฿${money(fines)} `}
                {pending > 0 && `${t(lang, 'atRisk')} ฿${money(pending)}`}
                {fines === 0 && pending === 0 && t(lang, 'noDeduction')}
              </div>
            </section>
          </div>

          {data.daily.length > 0 && (
            <section>
              <h2>{t(lang, 'gmvByDay')}</h2>
              <div className="day-bars" role="img" aria-label={t(lang, 'gmvByDay')}>
                {data.daily.map((d) => (
                  <div key={d.date} className="day-bar" title={`${d.date}: ฿${money(d.gmv)}`}>
                    <span className={d.gmv ? '' : 'zero'} style={{ height: `${(d.gmv / maxDay) * 100}%` }} />
                    <small>{Number(d.date.slice(8))}</small>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.byRoom.length > 0 && (
            <section>
              <h2>{t(lang, 'byRoom')}</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t(lang, 'room')}</th>
                      <th className="num">{t(lang, 'sessionsCount')}</th>
                      <th className="num">{t(lang, 'hoursSuffix')}</th>
                      <th className="num">GMV</th>
                      <th className="num">GMV / {t(lang, 'hoursSuffix')}</th>
                      <th className="num">{t(lang, 'rsMissing')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byRoom.map((r) => (
                      <tr key={r.roomId}>
                        <td>{r.roomCode}</td>
                        <td className="num">{r.sessions}</td>
                        <td className="num">{one(r.hours)}</td>
                        <td className="num">{money(r.gmv)}</td>
                        <td className="num">{money(r.gmvPerHour)}</td>
                        <td className={`num ${r.missing ? 'neg' : ''}`}>{r.missing || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.byPerson.length > 0 && (
            <section>
              <h2>{t(lang, manager ? 'byPerson' : 'myPerformance')}</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t(lang, 'person')}</th>
                      <th className="num">{t(lang, 'sessionsCount')}</th>
                      <th className="num">{t(lang, 'hoursSuffix')}</th>
                      <th className="num">GMV MC</th>
                      <th className="num">GMV PD</th>
                      <th className="num">{t(lang, 'rsMissing')}</th>
                      <th className="num">{t(lang, 'deduction')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byPerson.map((p) => (
                      <tr key={p.personId} className={p.personId === user.id ? 'mine' : ''}>
                        <td>{p.nickname}</td>
                        <td className="num">{p.sessions}</td>
                        <td className="num">{one(p.hours)}</td>
                        <td className="num">{p.gmvMc ? money(p.gmvMc) : '–'}</td>
                        <td className="num">{p.gmvPd ? money(p.gmvPd) : '–'}</td>
                        <td className={`num ${p.missing ? 'neg' : ''}`}>{p.missing || '–'}</td>
                        <td className="num">
                          {p.deduction ? <span className="neg">-{money(p.deduction)}</span> : p.pendingDeduction ? <span className="warning-text">({money(p.pendingDeduction)})</span> : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint">{t(lang, 'deductionNote').replace('{amount}', String(data.deductionAmount))}</p>
            </section>
          )}

          <section className="grow">
            <div className="section-head">
              <h2>{t(lang, 'sessionList')}</h2>
              <div className="segmented" role="group">
                <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>{t(lang, 'all')}</button>
                <button className={filter === 'missing' ? 'active' : ''} onClick={() => setFilter('missing')}>{t(lang, 'rsMissing')}</button>
              </div>
            </div>
            {sessions.length === 0 ? (
              <p className="muted">{t(lang, filter === 'missing' ? 'noMissing' : 'noSessionsMonth')}</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t(lang, 'date')}</th>
                      <th>{t(lang, 'time')}</th>
                      <th>{t(lang, 'room')}</th>
                      <th>MC</th>
                      <th>PD</th>
                      <th className="num">GMV</th>
                      <th className="num">{t(lang, 'm_orders')}</th>
                      <th className="num">{t(lang, 'readingsShort')}</th>
                      <th>{t(lang, 'status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id}>
                        <td>{bkkDate(new Date(s.start)).slice(5)}</td>
                        <td>{bkkTime(new Date(s.start))}–{bkkTime(new Date(s.end))}</td>
                        <td>{s.roomCode}</td>
                        <td>{s.mc.join(', ')}</td>
                        <td>{s.pd.join(', ')}</td>
                        <td className="num">{money(s.gmv)}</td>
                        <td className="num">{s.orders ?? '–'}</td>
                        <td className="num">{s.readings || '–'}</td>
                        <td>
                          <span className={`pill ${statusPill[s.status]}`}>{t(lang, statusKey[s.status])}</span>
                          {s.edited && <span className="tag">{t(lang, 'edited')}</span>}
                          {s.fined && <span className="tag tag-urgent">-{data.deductionAmount * s.responsible.length}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
