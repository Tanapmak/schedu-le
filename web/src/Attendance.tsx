import { useCallback, useEffect, useState } from 'react';
import { api, type DayAttendance, type Person, type Room, type Studio } from './api';
import { t, type Lang, type StringKey } from './i18n';
import { addDays, bkkTime, formatDay, todayBkk } from './time';
import { Modal } from './ui';

type Row = DayAttendance['rows'][number];

/** Admin: who clocked in and out for each session of a day, out-of-area approvals and hour fixes. */
export function AttendancePage({ lang, people, rooms }: { lang: Lang; people: Person[]; rooms: Room[] }) {
  const [date, setDate] = useState(todayBkk());
  const [data, setData] = useState<DayAttendance>();
  const [studioOpen, setStudioOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<Row>();

  const load = useCallback(() => void api.dayAttendance(date).then(setData), [date]);
  useEffect(load, [load]);

  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;
  const codeOf = (id: number) => rooms.find((r) => r.id === id)?.code ?? `#${id}`;
  const rows = data?.rows ?? [];
  const live = rows.filter((r) => r.state !== 'cancelled');
  const clockedIn = live.filter((r) => r.attendance).length;
  const late = live.filter((r) => r.attendance && r.lateMin > 0).length;
  const pending = live.filter((r) => r.attendance?.status === 'pending').length;
  const forgot = live.filter((r) => r.state === 'forgot_out').length;

  async function decide(r: Row, d: 'approve' | 'reject') {
    if (r.attendance && (await api.decideAttendance(r.attendance.id, d)).ok) load();
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>
            {t(lang, 'attendance')} · {formatDay(date, lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </h1>
          <p className="sub">{t(lang, 'attendanceHint')}</p>
        </div>
        <div className="head-actions">
          <div className="nav">
            <button aria-label="previous" onClick={() => setDate(addDays(date, -1))}>‹</button>
            <button onClick={() => setDate(todayBkk())}>{t(lang, 'today')}</button>
            <button aria-label="next" onClick={() => setDate(addDays(date, 1))}>›</button>
          </div>
          <button onClick={() => setStudioOpen(true)}>{t(lang, 'studioArea')}</button>
        </div>
      </div>

      <div className="stat-cards">
        <div className="stat">
          <small>{t(lang, 'statClockedIn')}</small>
          <strong>
            {clockedIn} <span>/ {live.length}</span>
          </strong>
        </div>
        <div className="stat">
          <small>{t(lang, 'statLate')}</small>
          <strong>{late}</strong>
        </div>
        <div className={`stat${pending ? ' alert' : ''}`}>
          <small>{t(lang, 'statOffsite')}</small>
          <strong>{pending}</strong>
        </div>
        <div className={`stat${forgot ? ' alert' : ''}`}>
          <small>{t(lang, 'statForgot')}</small>
          <strong>{forgot}</strong>
        </div>
      </div>

      {data && data.studios.length === 0 && <p className="warning-text">{t(lang, 'noStudioYet')}</p>}

      <div className="table-wrap">
        <table className="data attendance">
          <thead>
            <tr>
              <th>{t(lang, 'name')}</th>
              <th>{t(lang, 'role')}</th>
              <th>{t(lang, 'session')}</th>
              <th>Clock in</th>
              <th>Clock out</th>
              <th>{t(lang, 'status')}</th>
              <th className="num">{t(lang, 'countedHours')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  {t(lang, 'noSessionsDay')}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const a = r.attendance;
              return (
                <tr key={`${r.session.id}-${r.personId}`} className={a?.status === 'pending' ? 'row-alert' : r.state === 'cancelled' ? 'row-muted' : ''}>
                  <td>
                    <strong>{nameOf(r.personId)}</strong>
                  </td>
                  <td>{t(lang, r.role)}</td>
                  <td>
                    {bkkTime(new Date(r.session.start))}–{bkkTime(new Date(r.session.end))} · {codeOf(r.session.roomId)}
                  </td>
                  <td>{a ? bkkTime(new Date(a.clockInAt)) : '—'}</td>
                  <td>{a?.clockOutAt ? bkkTime(new Date(a.clockOutAt)) : '—'}</td>
                  <td>
                    <StatusCell lang={lang} row={r} />
                  </td>
                  <td className="num">
                    {a ? r.countedHours.toFixed(2) : '—'}
                    {a?.adjustedHours !== null && a?.adjustedHours !== undefined && <small className="muted"> ✎</small>}
                  </td>
                  <td>
                    <div className="row-actions">
                    {a?.status === 'pending' && (
                      <>
                        <button onClick={() => decide(r, 'reject')}>{t(lang, 'reject')}</button>
                        <button className="primary" onClick={() => decide(r, 'approve')}>
                          {t(lang, 'approve')}
                        </button>
                      </>
                    )}
                    {a && a.status !== 'pending' && (
                      <button className="link" onClick={() => setAdjusting(r)}>
                        {t(lang, 'adjustHours')}
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">{t(lang, 'forgotOutNote')}</p>

      {studioOpen && <StudioForm lang={lang} studios={data?.studios ?? []} onClose={() => setStudioOpen(false)} onSaved={() => (setStudioOpen(false), load())} />}
      {adjusting?.attendance && (
        <AdjustForm lang={lang} row={adjusting} name={nameOf(adjusting.personId)} onClose={() => setAdjusting(undefined)} onSaved={() => (setAdjusting(undefined), load())} />
      )}
    </div>
  );
}

function StatusCell({ lang, row: r }: { lang: Lang; row: Row }) {
  const a = r.attendance;
  const parts: { text: string; cls: string }[] = [];
  if (a && !a.inArea) {
    const where = a.inDistanceM !== null ? ` ${a.inDistanceM >= 1000 ? `${(a.inDistanceM / 1000).toFixed(1)} km` : `${a.inDistanceM} m`}` : '';
    parts.push({ text: `${t(lang, 'clockOffsite')}${where} · ${t(lang, `att_${a.status}` as StringKey)}`, cls: a.status === 'rejected' ? 'bad' : a.status === 'pending' ? 'alert' : 'ok' });
  }
  if (a && r.lateMin > 0) parts.push({ text: t(lang, 'lateMin').replace('{n}', String(r.lateMin)), cls: 'warn' });
  if (a && r.lateMin === 0 && a.inArea) parts.push({ text: t(lang, 'onTime'), cls: 'ok' });
  if (!a || r.state !== 'done') parts.push({ text: t(lang, `state_${r.state}` as StringKey), cls: r.state === 'missed' || r.state === 'forgot_out' ? 'bad' : r.state === 'working' ? 'ok' : 'muted' });
  return (
    <span className="status-stack">
      {parts.map((p, i) => (
        <span key={i} className={`pill st-${p.cls}`}>
          {p.text}
        </span>
      ))}
      {a?.offsiteReason && <small className="muted">“{a.offsiteReason}”</small>}
    </span>
  );
}

function StudioForm({ lang, studios, onClose, onSaved }: { lang: Lang; studios: Studio[]; onClose: () => void; onSaved: () => void }) {
  const first = studios[0];
  const [name, setName] = useState(first?.name ?? 'Studio');
  const [lat, setLat] = useState(first ? String(first.lat) : '');
  const [lng, setLng] = useState(first ? String(first.lng) : '');
  const [radius, setRadius] = useState(String(first?.radiusM ?? 100));
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  function here() {
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      (p) => (setLat(p.coords.latitude.toFixed(6)), setLng(p.coords.longitude.toFixed(6)), setLocating(false)),
      () => (setError(t(lang, 'clockNoGps')), setLocating(false)),
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  }

  async function save() {
    const out = await api.saveStudio({ id: first?.id, name: name.trim(), lat: Number(lat), lng: Number(lng), radiusM: Number(radius) });
    if (out.ok) onSaved();
    else setError(t(lang, 'loadFailed'));
  }

  const valid = name.trim() && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== '' && lng !== '' && Number(radius) >= 10;
  return (
    <Modal
      title={t(lang, 'studioArea')}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>{t(lang, 'close')}</button>
          <button className="primary" disabled={!valid} onClick={save}>
            {t(lang, 'saveBtn')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="wide">
          {t(lang, 'offDayName')}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Latitude
          <input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
        </label>
        <label>
          Longitude
          <input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
        </label>
        <label>
          {t(lang, 'radiusM')}
          <input inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value.replace(/\D/g, ''))} />
        </label>
        <div className="wide">
          <button disabled={locating} onClick={here}>
            {locating ? '…' : t(lang, 'useMyLocation')}
          </button>
          <p className="hint">{t(lang, 'studioHint')}</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}

function AdjustForm({ lang, row, name, onClose, onSaved }: { lang: Lang; row: Row; name: string; onClose: () => void; onSaved: () => void }) {
  const a = row.attendance!;
  const [hours, setHours] = useState(a.adjustedHours !== null ? String(a.adjustedHours) : row.countedHours.toFixed(2));
  const [note, setNote] = useState(a.adjustNote ?? '');
  async function save(value: number | null) {
    if ((await api.adjustAttendance(a.id, value, note)).ok) onSaved();
  }
  return (
    <Modal
      title={`${t(lang, 'adjustHours')} · ${name}`}
      onClose={onClose}
      footer={
        <>
          {a.adjustedHours !== null && <button onClick={() => save(null)}>{t(lang, 'useClockedHours')}</button>}
          <button className="primary" disabled={hours === '' || !(Number(hours) >= 0)} onClick={() => save(Number(hours))}>
            {t(lang, 'saveBtn')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label>
          {t(lang, 'countedHours')}
          <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <label className="wide">
          {t(lang, 'note')}
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
