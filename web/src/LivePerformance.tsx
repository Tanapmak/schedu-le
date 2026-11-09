import { useEffect, useRef, useState } from 'react';
import { api, type LiveSummary, type ResultStatus, type User, isManager } from './api';
import { t, type Lang, type StringKey } from './i18n';
import { addDays, bkkDate, bkkTime, todayBkk } from './time';

const money = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n.toLocaleString('en-US', { maximumFractionDigits: 0 }));
const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const statusPill: Record<ResultStatus, string> = {
  recorded: 'st-ok', missing: 'st-bad', late: 'st-alert', upcoming: 'st-muted', cancelled: 'st-muted',
};
const statusKey: Record<ResultStatus, StringKey> = {
  recorded: 'rsRecorded', missing: 'rsMissing', late: 'rsLate', upcoming: 'rsUpcoming', cancelled: 'cancelled',
};

const locale = (lang: Lang) => (lang === 'th' ? 'th-TH' : lang === 'zh' ? 'zh-CN' : 'en-GB');
/** A Bangkok YYYY-MM-DD (or YYYY-MM) shown in the user's language. */
const showDate = (lang: Lang, date: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${date.length === 7 ? `${date}-01` : date}T00:00:00Z`).toLocaleDateString(locale(lang), { ...opts, timeZone: 'UTC' });

type Preset = 'thisMonth' | 'lastMonth' | 'last7' | 'last30';
const presetKey: Record<Preset, StringKey> = { thisMonth: 'rangeThisMonth', lastMonth: 'rangeLastMonth', last7: 'rangeLast7', last30: 'rangeLast30' };
const lastDayOf = (month: string) => addDays(`${addMonth(month, 1)}-01`, -1);
function addMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
function presetRange(p: Preset): { from: string; to: string } {
  const today = todayBkk();
  const month = today.slice(0, 7);
  if (p === 'thisMonth') return { from: `${month}-01`, to: lastDayOf(month) };
  if (p === 'lastMonth') return { from: `${addMonth(month, -1)}-01`, to: lastDayOf(addMonth(month, -1)) };
  return { from: addDays(today, p === 'last7' ? -6 : -29), to: today };
}
const MAX_DAYS = 366;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

/** Live performance for chosen dates, checked in the app instead of exporting the payroll file. */
export function LivePerformancePage({ lang, user }: { lang: Lang; user: User }) {
  const [range, setRange] = useState(() => presetRange('thisMonth'));
  const [data, setData] = useState<LiveSummary>();
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'missing'>('all');
  const manager = isManager(user.role);
  const days = daysBetween(range.from, range.to);
  const badRange = !range.from || !range.to || days < 1 || days > MAX_DAYS;
  const preset = (Object.keys(presetKey) as Preset[]).find((p) => {
    const r = presetRange(p);
    return r.from === range.from && r.to === range.to;
  });

  useEffect(() => {
    if (badRange) return;
    let live = true;
    setData(undefined);
    setFailed(false);
    api.liveSummary(range.from, range.to).then((d) => live && setData(d), () => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [range.from, range.to, badRange]);

  const tot = data?.totals;
  // Last day results can still be recorded (the day before the cut-off), e.g. "24 ธ.ค. 2569".
  const cutoffDay = (cutoff: string) => showDate(lang, bkkDate(new Date(new Date(cutoff).getTime() - 1)), { day: 'numeric', month: 'short', year: 'numeric' });
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
        <div className="range-pick">
          <div className="segmented" role="group">
            {(Object.keys(presetKey) as Preset[]).map((p) => (
              <button key={p} className={preset === p ? 'active' : ''} onClick={() => setRange(presetRange(p))}>
                {t(lang, presetKey[p])}
              </button>
            ))}
          </div>
          <div className="inline-form">
            <label>
              {t(lang, 'dateFrom')}
              <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
            </label>
            <label>
              {t(lang, 'dateTo')}
              <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
            </label>
          </div>
        </div>
      </div>
      {badRange && <p className="error">{t(lang, 'rangeTooLong')}</p>}
      {failed && <p className="error">{t(lang, 'loadFailed')}</p>}
      {!data && !failed && !badRange && <p className="muted">{t(lang, 'loading')}</p>}

      {data && tot && !badRange && (
        <>
          <div className="notices">
          {data.months.map((m) => (
            <p key={m.month} className={m.closed ? 'hint' : 'notice-bar'}>
              {t(lang, m.closed ? 'cutoffClosed' : 'cutoffOpen')
                .replace('{month}', showDate(lang, m.month, { month: 'long', year: 'numeric' }))
                .replace('{date}', cutoffDay(m.cutoff))
                .replace('{amount}', String(data.deductionAmount))}
            </p>
          ))}
          </div>
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
              <div className="section-head">
                <h2>{t(lang, 'gmvByDay')}</h2>
                <span className="hint">{t(lang, 'gmvByDayHint')}</span>
              </div>
              <DayChart lang={lang} daily={data.daily} />
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

/** GMV per day as bars. Hover (or tap on a phone) shows the day's GMV, orders and sessions. */
function DayChart({ lang, daily }: { lang: Lang; daily: LiveSummary['daily'] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ i: number; x: number }>();
  const max = Math.max(1, ...daily.map((d) => d.gmv));
  const many = daily.length > 31;
  const show = (i: number, el: HTMLElement) => {
    const box = wrap.current?.getBoundingClientRect();
    const bar = el.getBoundingClientRect();
    if (box) setTip({ i, x: bar.left - box.left + bar.width / 2 });
  };
  const d = tip ? daily[tip.i] : undefined;
  const width = wrap.current?.clientWidth ?? 0;

  return (
    <div className="day-chart" ref={wrap} onMouseLeave={() => setTip(undefined)}>
      <div className="day-max hint">฿{money(max)}</div>
      <div className="day-bars" role="img" aria-label={t(lang, 'gmvByDay')} onScroll={() => setTip(undefined)}>
        {daily.map((x, i) => {
          const first = x.date.endsWith('-01');
          // Long ranges: label the 1st of each month and every 7th day so labels don't overlap.
          const label = !many || first || Number(x.date.slice(8)) % 7 === 0;
          return (
            <div
              key={x.date}
              className={`day-bar ${tip?.i === i ? 'on' : ''}`}
              aria-label={`${x.date}: ฿${money(x.gmv)}`}
              onMouseEnter={(e) => show(i, e.currentTarget)}
              onClick={(e) => (tip?.i === i ? setTip(undefined) : show(i, e.currentTarget))}
            >
              <span className={x.gmv ? '' : 'zero'} style={{ height: `${(x.gmv / max) * 100}%` }} />
              {label && <small>{first && (many || daily[0].date.slice(0, 7) !== daily[daily.length - 1].date.slice(0, 7)) ? `${Number(x.date.slice(8))}/${Number(x.date.slice(5, 7))}` : Number(x.date.slice(8))}</small>}
            </div>
          );
        })}
      </div>
      {d && tip && (
        <div className="day-tip" style={{ left: Math.min(Math.max(tip.x, 80), Math.max(80, width - 80)) }}>
          <strong>{showDate(lang, d.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</strong>
          <div className="day-tip-gmv">GMV ฿{money(d.gmv)}</div>
          <div className="muted">
            {money(d.orders)} {t(lang, 'm_orders')} · {d.sessions} {t(lang, 'sessionsCount')}
          </div>
        </div>
      )}
    </div>
  );
}
