import { useCallback, useEffect, useState } from 'react';
import { api, type MyAttendance, type Room, type Studio } from './api';
import { t, type Lang, type StringKey } from './i18n';
import { bkkDate, bkkTime, formatDay } from './time';

type Fix = { lat: number; lng: number; accuracy: number };

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

/** MC/PD clock in and out on their phone. The studio area is checked with the phone's GPS. */
export function ClockIn({ lang, rooms }: { lang: Lang; rooms: Room[] }) {
  const [me, setMe] = useState<MyAttendance>();
  const [fix, setFix] = useState<Fix>();
  const [geoError, setGeoError] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string }>();

  const load = useCallback(() => void api.myAttendance().then(setMe), []);
  useEffect(load, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!navigator.geolocation) return setGeoError(true);
    const id = navigator.geolocation.watchPosition(
      (p) => (setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), setGeoError(false)),
      () => setGeoError(true),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const session = me?.session ?? null;
  const open = me?.open ?? null;
  // Places this session may be clocked in from: the offsite spot, or any studio.
  const places: Studio[] =
    session?.location === 'offsite' && session.offsite ? [{ id: 0, name: 'offsite', ...session.offsite, radiusM: 300 }] : (me?.studios ?? []);
  const noCheck = session?.location === 'home' || places.length === 0;
  const nearest = fix && places.length ? places.map((p) => ({ p, d: distanceM(fix, p) })).sort((a, b) => a.d - b.d)[0] : undefined;
  const inArea = noCheck || Boolean(nearest && places.some((p) => distanceM(fix!, p) <= p.radiusM));
  const opensAt = me?.opensAt ? new Date(me.opensAt).getTime() : null;
  const windowOpen = Boolean(session && opensAt !== null && now >= opensAt);
  const codeOf = (id: number) => rooms.find((r) => r.id === id)?.code ?? `#${id}`;

  async function doClock(withReason?: string) {
    setBusy(true);
    setMessage(undefined);
    try {
      const at = fix ? { lat: fix.lat, lng: fix.lng } : null;
      const out = open ? await api.clockOut(at) : await api.clockIn(at, withReason);
      if (out.ok) {
        setMessage({ kind: 'ok', text: t(lang, open ? 'clockedOut' : out.status === 'pending' ? 'clockPending' : 'clockedIn') });
        setAsking(false);
        setReason('');
      } else {
        const known = ['already_clocked_in', 'too_early', 'no_session', 'out_of_area_needs_reason', 'not_clocked_in'];
        setMessage({ kind: 'error', text: known.includes(out.error) ? t(lang, `clockErr_${out.error}` as StringKey) : out.error });
      }
      load();
    } finally {
      setBusy(false);
    }
  }

  const today = (me?.records ?? []).filter((r) => bkkDate(new Date(r.clockInAt)) === bkkDate(new Date(now)));

  return (
    <div className="page clock-page">
      <p className="sub">
        {formatDay(bkkDate(new Date(now)), lang, { weekday: 'long', day: 'numeric', month: 'long' })} · {bkkTime(new Date(now))}
      </p>
      <h1>{t(lang, open ? 'clockOutTitle' : 'clockInTitle')}</h1>

      {!noCheck && <GeoMap places={places} fix={fix} />}

      <ul className="clock-checks">
        {noCheck ? (
          <li className="ok">✓ {t(lang, session?.location === 'home' ? 'clockHome' : 'clockNoStudio')}</li>
        ) : geoError ? (
          <li className="bad">✕ {t(lang, 'clockNoGps')}</li>
        ) : !fix ? (
          <li className="muted">… {t(lang, 'clockLocating')}</li>
        ) : inArea ? (
          <li className="ok">✓ {t(lang, 'clockInArea').replace('{d}', fmtDistance(nearest!.d))}</li>
        ) : (
          <li className="bad">✕ {t(lang, 'clockOutArea').replace('{d}', fmtDistance(nearest!.d))}</li>
        )}
        {session ? (
          <li className={windowOpen || open ? 'ok' : 'muted'}>
            {windowOpen || open ? '✓' : '○'} {t(lang, open ? 'clockSessionNow' : 'clockNextSession')}: {bkkTime(new Date(session.start))}–{bkkTime(new Date(session.end))} · {codeOf(session.roomId)} ·{' '}
            {t(lang, 'clockRole')} {t(lang, session.role)}
            {bkkDate(new Date(session.start)) !== bkkDate(new Date(now)) && ` (${formatDay(bkkDate(new Date(session.start)), lang, { weekday: 'short', day: 'numeric', month: 'short' })})`}
          </li>
        ) : (
          <li className="muted">○ {t(lang, 'clockNoSession')}</li>
        )}
        {session && !open && opensAt !== null && (
          <li className="muted">
            {t(lang, 'clockWindow').replace('{time}', bkkTime(new Date(opensAt))).replace('{n}', String(me?.windowMinutes ?? 30))}
          </li>
        )}
      </ul>

      <div className="clock-button-wrap">
        <button
          className={`clock-button${open ? ' out' : ''}`}
          disabled={busy || !session || (!open && (!windowOpen || !inArea))}
          onClick={() => doClock()}
        >
          {open ? 'Clock out' : 'Clock in'}
        </button>
        {!open && windowOpen && !inArea && !asking && (
          <button className="link" onClick={() => setAsking(true)}>
            {t(lang, 'clockAskOffsite')}
          </button>
        )}
      </div>

      {asking && (
        <div className="card offsite-ask">
          <label>
            {t(lang, 'clockOffsiteReason')}
            <textarea value={reason} rows={2} onChange={(e) => setReason(e.target.value)} />
          </label>
          <p className="hint">{t(lang, 'clockOffsiteHint')}</p>
          <div className="row-actions">
            <button onClick={() => setAsking(false)}>{t(lang, 'cancelBtn')}</button>
            <button className="primary" disabled={busy || !reason.trim()} onClick={() => doClock(reason.trim())}>
              {t(lang, 'clockSendOffsite')}
            </button>
          </div>
        </div>
      )}

      {message && <p className={message.kind === 'ok' ? 'ok-text' : 'error'}>{message.text}</p>}

      <section>
        <h2>{t(lang, 'today')}</h2>
        {today.length === 0 && <p className="muted">{t(lang, 'clockNothingToday')}</p>}
        <ul className="clock-today">
          {today.flatMap((r) => [
            <li key={`${r.id}in`}>
              <span>Clock in</span>
              <strong>{bkkTime(new Date(r.clockInAt))}</strong>
              <small className="muted">
                {r.inArea ? (r.inDistanceM !== null ? fmtDistance(r.inDistanceM) : '') : `${t(lang, 'clockOffsite')} · ${t(lang, `att_${r.status}` as StringKey)}`}
              </small>
            </li>,
            <li key={`${r.id}out`}>
              <span>Clock out</span>
              <strong>{r.clockOutAt ? bkkTime(new Date(r.clockOutAt)) : '—'}</strong>
              <small className="muted">{r.clockOutAt ? '' : t(lang, 'clockWorking')}</small>
            </li>,
          ])}
        </ul>
      </section>
    </div>
  );
}

/** A small map-like sketch: the allowed area as a dashed circle, the phone as a dot. */
function GeoMap({ places, fix }: { places: Studio[]; fix?: Fix }) {
  const p = places[0];
  const size = 240;
  const c = size / 2;
  const scale = (size * 0.28) / p.radiusM; // px per metre: the radius fills ~a quarter of the box
  let dot: { x: number; y: number; clipped: boolean } | undefined;
  if (fix) {
    const dx = (fix.lng - p.lng) * 111_320 * Math.cos((p.lat * Math.PI) / 180);
    const dy = (fix.lat - p.lat) * 110_540;
    let x = dx * scale;
    let y = -dy * scale;
    const r = Math.hypot(x, y);
    const max = c - 14;
    const clipped = r > max;
    if (clipped) (x = (x / r) * max), (y = (y / r) * max);
    dot = { x: c + x, y: c + y, clipped };
  }
  return (
    <svg className="geo-map" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="map">
      <rect width={size} height={size} rx="12" className="geo-bg" />
      <path d={`M0 ${c * 0.6} H${size} M0 ${c * 1.5} H${size} M${c * 0.5} 0 V${size} M${c * 1.4} 0 V${size}`} className="geo-road" />
      <circle cx={c} cy={c} r={p.radiusM * scale} className="geo-area" />
      <rect x={c - 7} y={c - 7} width="14" height="14" rx="3" className="geo-studio" />
      {dot && <circle cx={dot.x} cy={dot.y} r="8" className={`geo-me${dot.clipped ? ' far' : ''}`} />}
    </svg>
  );
}
