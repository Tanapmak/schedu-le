import { useEffect, useState } from 'react';
import { api, type AutoPlan, type Person, type Room, type TeamPreference } from './api';
import { Preview } from './BulkTools';
import { t, type Lang, type StringKey } from './i18n';
import { addDays, formatDay, liveDate, mondayOf } from './time';
import { Modal } from './ui';

const endOfMonth = (d: string) => {
  const [y, m] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

const positionKey: Record<Person['position'], StringKey> = { mc: 'roleMc', pd: 'rolePd', operation: 'roleOperation' };

/** AI scheduling: pick a pattern week, the dates and who may work; check the plan; add it as drafts. */
export function AutoSchedule({
  lang,
  date,
  rooms,
  people,
  onClose,
  onDone,
}: {
  lang: Lang;
  date: string;
  rooms: Room[];
  people: Person[];
  onClose: () => void;
  onDone: (firstDate: string | null) => void;
}) {
  const [source, setSource] = useState(mondayOf(date));
  const nextMonday = addDays(source, 7);
  const [targetFrom, setTargetFrom] = useState(nextMonday);
  const [targetTo, setTargetTo] = useState(addDays(nextMonday, 6));
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [maxDay, setMaxDay] = useState(8);
  const [wishes, setWishes] = useState('');
  const [aiOn, setAiOn] = useState(true);
  const [teamPrefs, setTeamPrefs] = useState<TeamPreference[]>([]);
  const [usePrefs, setUsePrefs] = useState(true);
  const [perfLives, setPerfLives] = useState(0);
  const [usePerf, setUsePerf] = useState(true);
  const [historyNote, setHistoryNote] = useState('');
  const [plan, setPlan] = useState<AutoPlan>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const day = (d: string) => formatDay(d, lang, { weekday: 'short', day: 'numeric', month: 'short' });

  useEffect(() => {
    void api.autoDefaults().then((d) => {
      setChosen(new Set(d.peopleIds));
      setAiOn(d.aiPlanner);
      setPerfLives(d.performanceLives);
    });
  }, []);

  // Each person's latest wishes for the months being planned.
  useEffect(() => {
    if (!targetFrom || !targetTo || targetTo < targetFrom) return;
    void api.preferences(targetFrom.slice(0, 7), targetTo.slice(0, 7)).then(setTeamPrefs, () => setTeamPrefs([]));
  }, [targetFrom, targetTo]);

  const changed = () => (setPlan(undefined), setError(''));
  function moveSource(weeks: number) {
    const s = addDays(source, weeks * 7);
    setSource(s);
    setTargetFrom(addDays(s, 7));
    setTargetTo(addDays(s, 13));
    changed();
  }
  function toggle(id: number) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
    changed();
  }

  async function run() {
    setBusy(true);
    setError('');
    const out = await api.autoPlan({ sourceFrom: source, targetFrom, targetTo, peopleIds: [...chosen], maxDayHours: maxDay, instructions: aiOn ? wishes : '', usePreferences: aiOn && usePrefs, usePerformance: usePerf });
    setBusy(false);
    if ('plan' in out && out.plan) setPlan(out.plan);
    else setError(out.error === 'ai_failed' ? t(lang, 'aiPlanFailed') : (out.error ?? t(lang, 'loadFailed')));
  }

  async function loadHistory(f: File | undefined) {
    if (!f) return;
    setHistoryNote(t(lang, 'loading'));
    const out = await api.loadHistory(await f.text());
    if ('error' in out) return setHistoryNote(out.error ?? '');
    setHistoryNote(t(lang, 'aiHistoryLoaded').replace('{n}', String(out.loaded)).replace('{s}', String(out.skipped)));
    setPerfLives((await api.autoDefaults()).performanceLives);
    changed();
  }

  async function save() {
    if (!plan) return;
    setBusy(true);
    const sessions = plan.rows.filter((r) => r.ok && r.start && r.end && r.roomId && r.staff).map((r) => ({ roomId: r.roomId!, start: r.start!, end: r.end!, staff: r.staff! }));
    const out = await api.autoSave(sessions);
    setBusy(false);
    if (!out.rows) return setError(out.message ?? t(lang, 'loadFailed'));
    const first = out.rows.filter((r) => r.ok && r.start).map((r) => r.start!).sort()[0];
    onDone(first ? liveDate(new Date(first)) : null);
  }

  const active = people.filter((p) => p.isActive);
  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;
  const good = plan?.rows.filter((r) => r.ok).length ?? 0;
  // Lives already on the board are left alone; show them as one line, not a wall of skipped rows.
  const shown = plan?.rows.filter((r) => !r.problems.includes('room_taken')) ?? [];
  const leftAlone = (plan?.rows.length ?? 0) - shown.length;
  const chosenPrefs = teamPrefs.filter((p) => chosen.has(p.personId));

  return (
    <Modal title={t(lang, 'aiTitle')} onClose={onClose} footer={null} wide>
      <div className="bulk-panel">
        <p className="hint">{t(lang, 'aiHint')}</p>

        {!plan && (
          <>
            <div className="bulk-step">
              <strong>{t(lang, 'aiPattern')}</strong>
              <div className="nav">
                <button aria-label="previous" onClick={() => moveSource(-1)}>‹</button>
                <span className="bulk-week">
                  {day(source)} – {day(addDays(source, 6))}
                </span>
                <button aria-label="next" onClick={() => moveSource(1)}>›</button>
              </div>
            </div>
            <div className="bulk-step">
              <strong>{t(lang, 'copyTo')}</strong>
              <div className="bulk-dates">
                <input type="date" value={targetFrom} onChange={(e) => (setTargetFrom(e.target.value), changed())} />
                <span>–</span>
                <input type="date" value={targetTo} onChange={(e) => (setTargetTo(e.target.value), changed())} />
              </div>
              <div className="bulk-quick">
                <button className="link" onClick={() => (setTargetFrom(nextMonday), setTargetTo(addDays(nextMonday, 6)), changed())}>
                  {t(lang, 'copyNextWeek')}
                </button>
                <button className="link" onClick={() => (setTargetFrom(nextMonday), setTargetTo(endOfMonth(nextMonday)), changed())}>
                  {t(lang, 'copyToMonthEnd')}
                </button>
                <button
                  className="link"
                  onClick={() => {
                    const first = addDays(endOfMonth(source), 1);
                    setTargetFrom(first);
                    setTargetTo(endOfMonth(first));
                    changed();
                  }}
                >
                  {t(lang, 'copyNextMonth')}
                </button>
              </div>
            </div>

            <div className="bulk-step">
              <strong>{t(lang, 'aiPeople')}</strong>
              <p className="hint">{t(lang, 'aiPeopleHint')}</p>
              {(['mc', 'pd', 'operation'] as const).map((pos) => {
                const group = active.filter((p) => p.position === pos);
                if (group.length === 0) return null;
                return (
                  <div key={pos} className="ai-people">
                    <span className="muted">{t(lang, positionKey[pos])}</span>
                    {group.map((p) => (
                      <label key={p.id} className={`ai-chip${chosen.has(p.id) ? ' on' : ''}`}>
                        <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />
                        {p.nickname}
                        {p.employment !== 'full_time' && <small> · {p.employment}</small>}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>

            <label className="bulk-step">
              <strong>{t(lang, 'aiMaxDay')}</strong>
              <input type="number" min={2} max={16} step={1} value={maxDay} onChange={(e) => (setMaxDay(Number(e.target.value)), changed())} style={{ width: 90 }} />
            </label>

            <div className="bulk-step ai-options">
              <label>
                <input type="checkbox" checked={usePrefs && aiOn} disabled={!aiOn || chosenPrefs.length === 0} onChange={(e) => (setUsePrefs(e.target.checked), changed())} />
                {t(lang, 'aiUsePrefs').replace('{n}', String(chosenPrefs.length))}
              </label>
              {!aiOn && chosenPrefs.length > 0 && <span className="hint">{t(lang, 'aiUsePrefsNoKey')}</span>}
              {aiOn && usePrefs && chosenPrefs.length > 0 && (
                <ul className="ai-team-prefs">
                  {chosenPrefs.map((p) => (
                    <li key={p.id}>
                      <strong>{p.nickname}</strong> <span className="muted">({p.month})</span>: {p.text}
                    </li>
                  ))}
                </ul>
              )}
              <label>
                <input type="checkbox" checked={usePerf} disabled={perfLives === 0} onChange={(e) => (setUsePerf(e.target.checked), changed())} />
                {t(lang, 'aiUsePerf').replace('{n}', perfLives.toLocaleString())}
              </label>
              <span className="hint">
                {t(lang, 'aiPerfHint')}{' '}
                <label className="link file-link">
                  <input type="file" accept=".csv" hidden onChange={(e) => void loadHistory(e.target.files?.[0])} />
                  {t(lang, 'aiLoadHistory')}
                </label>{' '}
                {historyNote}
              </span>
            </div>

            <label className="bulk-step">
              <strong>{t(lang, 'aiWishes')}</strong>
              <textarea rows={3} value={wishes} disabled={!aiOn} placeholder={t(lang, 'aiWishesPlaceholder')} onChange={(e) => (setWishes(e.target.value), changed())} />
              {!aiOn && <span className="hint">{t(lang, 'aiNoKey')}</span>}
            </label>
          </>
        )}

        {error && <p className="error">{error}</p>}

        {plan && (
          <>
            {plan.wishes && (plan.wishes.summary.length > 0 || plan.wishes.notUnderstood.length > 0 || plan.preferencesUsed > 0) && (
              <div className="ai-understood">
                {plan.preferencesUsed > 0 && <p className="hint">{t(lang, 'aiPrefsRead').replace('{n}', String(plan.preferencesUsed))}</p>}
                {plan.wishes.summary.length > 0 && (
                  <>
                    <strong>{t(lang, 'aiUnderstood')}</strong>
                    <ul>
                      {plan.wishes.summary.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
                {plan.wishes.notUnderstood.length > 0 && (
                  <p className="warning-text">
                    {t(lang, 'aiNotUnderstood')}: {plan.wishes.notUnderstood.join(' · ')}
                  </p>
                )}
              </div>
            )}

            {plan.people.length > 0 && (
              <div className="bulk-step">
                <strong>{t(lang, 'aiHoursTitle')}</strong>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th />
                        <th className="num">{t(lang, 'aiPlanned')}</th>
                        {plan.people[0].months.map((m) => (
                          <th key={m.month} className="num">
                            {t(lang, 'aiMonthTotal').replace('{m}', m.month)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {plan.people.map((p) => (
                        <tr key={p.personId}>
                          <td>{nameOf(p.personId)}</td>
                          <td className="num">{p.plannedHours ? `+${p.plannedHours}` : '–'}</td>
                          {p.months.map((m) => (
                            <td key={m.month} className={`num${m.hours > m.max ? ' error' : ''}`}>
                              {m.hours}
                              {m.kpi !== null && <span className="muted"> / {m.kpi}</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {plan.performanceLives ? <p className="hint">{t(lang, 'aiPerfUsed').replace('{n}', plan.performanceLives.toLocaleString())}</p> : null}
            {leftAlone > 0 && <p className="hint">{t(lang, 'aiRoomTaken').replace('{n}', String(leftAlone))}</p>}
            {shown.length === 0 && <p className="warning-text">{t(lang, 'aiNothingToFill')}</p>}
            {shown.length > 0 && <Preview lang={lang} rows={shown} rooms={rooms} people={people} />}
          </>
        )}

        <div className="row-actions bulk-actions">
          {!plan ? (
            <button className="primary" disabled={busy || chosen.size === 0 || !targetFrom || !targetTo} onClick={() => void run()}>
              {busy ? t(lang, 'aiRunning') : t(lang, 'aiRun')}
            </button>
          ) : (
            <>
              <button disabled={busy} onClick={changed}>
                {t(lang, 'aiRerun')}
              </button>
              <button className="primary" disabled={busy || good === 0} onClick={() => void save()}>
                {t(lang, 'addDrafts').replace('{n}', String(good))}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
