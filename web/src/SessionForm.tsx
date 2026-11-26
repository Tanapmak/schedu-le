import { useEffect, useMemo, useState } from 'react';
import { api, CANCEL_REASONS, type CancelReason, type CreditChoice, type OffsitePlace, type Person, type Room, type Session, type SessionInput, type SessionLocation } from './api';
import { cancelKey, CreditPanel } from './LeaveExtras';
import { t, violationMessage, type Lang, type ViolationLike } from './i18n';
import { bkkDate, bkkTime, formatDay, liveDate, liveInstant } from './time';
import { mapsLink, useBackdropClose } from './ui';

/**
 * Reads coordinates from what people paste: "13.7466, 100.5393", or a Google Maps link
 * (…/@13.7466,100.5393,17z, …?q=13.7466,100.5393, …!3d13.7466!4d100.5393).
 */
export function parseCoords(text: string): { lat: number; lng: number } | null {
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`@${num},${num}`),
    new RegExp(`[?&](?:q|query|ll|destination)=${num},\\s*${num}`),
    new RegExp(`^\\s*${num}\\s*[,\\s]\\s*${num}\\s*$`),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}

export type FormTarget =
  | { mode: 'new'; roomId?: number; date: string; start: string; end: string }
  | { mode: 'edit'; session: Session };

interface Props {
  lang: Lang;
  rooms: Room[];
  people: Person[];
  target: FormTarget;
  onClose: () => void;
  onSaved: (id?: number) => void;
}

export function SessionForm({ lang, rooms, people, target, onClose, onSaved }: Props) {
  const editing = target.mode === 'edit' ? target.session : undefined;
  const firstStaff = (role: 'mc' | 'pd') => editing?.staff.find((s) => s.role === role && !s.replaced)?.personId ?? 0;

  const [roomId, setRoomId] = useState(editing?.roomId ?? (target.mode === 'new' ? target.roomId : undefined) ?? 0);
  const [date, setDate] = useState(editing ? liveDate(new Date(editing.start)) : target.mode === 'new' ? target.date : '');
  const [start, setStart] = useState(editing ? bkkTime(new Date(editing.start)) : target.mode === 'new' ? target.start : '10:00');
  const [end, setEnd] = useState(editing ? bkkTime(new Date(editing.end)) : target.mode === 'new' ? target.end : '12:00');
  const [mc, setMc] = useState(firstStaff('mc'));
  const [pd, setPd] = useState(firstStaff('pd'));
  const [note, setNote] = useState(editing?.note ?? '');
  // Where the live happens. Studio is the default (the studio area set on the Clock in page).
  const [location, setLocation] = useState<SessionLocation>((editing?.location as SessionLocation) ?? 'studio');
  const [placeName, setPlaceName] = useState(editing?.offsite?.name ?? '');
  const [coordsText, setCoordsText] = useState(editing?.offsite ? `${editing.offsite.lat}, ${editing.offsite.lng}` : '');
  const [radius, setRadius] = useState(String(editing?.offsite?.radiusM ?? 300));
  const [locating, setLocating] = useState(false);
  const coords = parseCoords(coordsText);
  const radiusM = Number(radius);
  const offsite: OffsitePlace | null =
    location === 'offsite' && placeName.trim() && coords && radiusM >= 20 && radiusM <= 5000 ? { name: placeName.trim(), ...coords, radiusM } : null;
  const placeOk = location !== 'offsite' || offsite !== null;

  function useHere() {
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      (p) => (setCoordsText(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`), setLocating(false)),
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  }
  const [violations, setViolations] = useState<ViolationLike[]>([]);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelCode, setCancelCode] = useState<CancelReason | ''>('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [credits, setCredits] = useState<{ choices: CreditChoice[]; valid: boolean }>({ choices: [], valid: true });
  const [creditError, setCreditError] = useState('');
  const onCredits = (choices: CreditChoice[], valid: boolean) => setCredits({ choices, valid });
  const canCancel = cancelCode !== '' && (cancelCode !== 'other' || cancelReason.trim() !== '') && credits.valid;

  const room = rooms.find((r) => r.id === roomId);
  const needsPd = room ? room.roomType === 'live' && room.requiresPd : true;
  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;
  const codeOf = (id: number) => rooms.find((r) => r.id === id)?.code ?? `#${id}`;
  const active = people.filter((p) => p.isActive);
  // A PD can host; operation staff can fill either seat. They are listed after the regulars.
  const byPosition = (...positions: Person['position'][]) => positions.flatMap((pos) => active.filter((p) => p.position === pos));
  const mcOptions = byPosition('mc', 'pd', 'operation');
  const pdOptions = byPosition('pd', 'operation');

  const input = useMemo((): SessionInput | undefined => {
    if (!roomId || !date || !start || !end) return undefined;
    // The date is the live day; 00:00–05:59 means the night after it (see liveInstant).
    const s = liveInstant(date, start);
    let e = liveInstant(date, end);
    if (e <= s) e = new Date(e.getTime() + 86_400_000); // e.g. 06:00 → 06:00
    // Keep anyone the form doesn't show (a second MC, replaced staff) as they are.
    const shown = new Set([firstStaff('mc'), firstStaff('pd')]);
    const others = (editing?.staff ?? []).filter((x) => !shown.has(x.personId));
    const staff = [
      ...(mc ? [{ personId: mc, role: 'mc' as const }] : []),
      ...(pd && needsPd ? [{ personId: pd, role: 'pd' as const }] : []),
      ...others,
    ];
    return { roomId, start: s.toISOString(), end: e.toISOString(), note, staff };
  }, [roomId, date, start, end, mc, pd, note, needsPd]);
  // The place is not part of the rule check, so typing it doesn't re-run the checks.
  const placeInput = { location, offsite: location === 'offsite' ? offsite : null };

  // Check as the admin types, so clashes show before pressing save.
  useEffect(() => {
    setNeedsConfirm(false);
    if (!input) return;
    const timer = setTimeout(() => {
      api.check({ ...input, id: editing?.id }).then(setViolations, () => setViolations([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [input, editing?.id]);

  const errors = violations.filter((v) => v.severity === 'error');

  async function save() {
    if (!input) return;
    setBusy(true);
    try {
      const res = await api.save({ ...input, ...placeInput }, { id: editing?.id, confirm: needsConfirm });
      if (res.ok) return onSaved(res.id);
      setViolations(res.violations);
      setNeedsConfirm(res.violations.every((v) => v.severity === 'warning'));
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setCreditError('');
    try {
      const out = await fn();
      if (out.ok) onSaved();
      else if (out.error) setCreditError(out.error);
    } finally {
      setBusy(false);
    }
  }

  const backdrop = useBackdropClose(onClose);
  return (
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal" role="dialog" aria-modal="true">
        <header>
          <h2>{t(lang, editing ? 'editSession' : 'newSession')}</h2>
          <button className="icon" aria-label={t(lang, 'close')} onClick={onClose}>
            ×
          </button>
        </header>

        <div className="form-grid">
          <label>
            {t(lang, 'room')}
            <select value={roomId} onChange={(e) => setRoomId(Number(e.target.value))}>
              <option value={0}>{t(lang, 'choose')}</option>
              {rooms
                .filter((r) => r.isActive || r.id === roomId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t(lang, 'date')}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            {t(lang, 'startTime')}
            <input type="time" step={1800} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            {t(lang, 'endTime')}
            <input type="time" step={1800} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          {input && bkkDate(new Date(Date.parse(input.end) - 1)) !== date && (
            <p className="hint wide overnight-hint">
              {t(lang, 'overnightHint')
                .replace('{start}', `${formatDay(bkkDate(new Date(input.start)), lang, { weekday: 'short', day: 'numeric', month: 'short' })} ${start}`)
                .replace('{end}', `${formatDay(bkkDate(new Date(input.end)), lang, { weekday: 'short', day: 'numeric', month: 'short' })} ${end}`)}
            </p>
          )}
          <label>
            {t(lang, 'mc')}
            <select value={mc} onChange={(e) => setMc(Number(e.target.value))}>
              <option value={0}>{t(lang, 'choose')}</option>
              {mcOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname}
                  {p.position === 'pd' ? ' (PD)' : p.position === 'operation' ? ' (OP)' : ''}
                </option>
              ))}
            </select>
          </label>
          {needsPd ? (
            <label>
              {t(lang, 'pd')}
              <select value={pd} onChange={(e) => setPd(Number(e.target.value))}>
                <option value={0}>{t(lang, 'choose')}</option>
                {pdOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname}
                    {p.position === 'operation' ? ' (OP)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="hint">{t(lang, 'contentNoPd')}</p>
          )}
          <label className="wide">
            {t(lang, 'liveLocation')}
            <select value={location} onChange={(e) => setLocation(e.target.value as SessionLocation)}>
              <option value="studio">{t(lang, 'locStudio')}</option>
              <option value="offsite">{t(lang, 'locOffsite')}</option>
              {location === 'home' && <option value="home">{t(lang, 'locHome')}</option>}
            </select>
          </label>
          {location === 'offsite' && (
            <div className="wide offsite-fields">
              <label>
                {t(lang, 'placeName')} *
                <input value={placeName} placeholder={t(lang, 'placeNamePh')} maxLength={120} onChange={(e) => setPlaceName(e.target.value)} />
              </label>
              <label>
                {t(lang, 'placeCoords')} *
                <input value={coordsText} placeholder={t(lang, 'placeCoordsPh')} onChange={(e) => setCoordsText(e.target.value)} />
              </label>
              {coordsText.trim() && !coords && <p className="error-text">{t(lang, 'placeCoordsBad')}</p>}
              <div className="offsite-row">
                <button type="button" disabled={locating} onClick={useHere}>
                  {locating ? '…' : `📍 ${t(lang, 'placeUseHere')}`}
                </button>
                <label>
                  {t(lang, 'placeRadius')}
                  <input inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value.replace(/\D/g, ''))} />
                </label>
              </div>
              {coords && (
                <div className="offsite-map">
                  <iframe
                    title={t(lang, 'placeCheck')}
                    loading="lazy"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.006},${coords.lat - 0.004},${coords.lng + 0.006},${coords.lat + 0.004}&layer=mapnik&marker=${coords.lat},${coords.lng}`}
                  />
                  <a href={mapsLink(coords)} target="_blank" rel="noreferrer">
                    {t(lang, 'placeCheck')} (Google Maps) ↗
                  </a>
                </div>
              )}
              <p className="hint">{t(lang, 'placeHint')}</p>
            </div>
          )}
          <label className="wide">
            {t(lang, 'note')}
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>

        <ul className="checks" aria-live="polite">
          {input && violations.length === 0 && <li className="ok">{t(lang, 'checksOk')}</li>}
          {violations.map((v, i) => (
            <li key={i} className={v.severity}>
              {v.severity === 'error' ? '✕ ' : '! '}
              {violationMessage(lang, v, nameOf, codeOf)}
            </li>
          ))}
        </ul>

        {editing && editing.status === 'cancelled' && (
          <div className="cancelled-credit">
            <p className="hint">
              {t(lang, 'cancelReasonPick')}:{' '}
              {[editing.cancelReasonCode ? t(lang, cancelKey[editing.cancelReasonCode]) : '', editing.cancelReason !== editing.cancelReasonCode ? editing.cancelReason : '']
                .filter(Boolean)
                .join(' · ')}
            </p>
            <CreditPanel lang={lang} sessionId={editing.id} people={people} preview={false} onChange={onCredits} />
            <button disabled={busy || !credits.valid} onClick={() => act(() => api.saveCredits(editing.id, credits.choices))}>
              {t(lang, 'saveCredits')}
            </button>
          </div>
        )}

        {editing && editing.status !== 'cancelled' && (
          <details className="danger-zone" onToggle={(e) => setCancelOpen((e.target as HTMLDetailsElement).open)}>
            <summary>{t(lang, editing.status === 'draft' ? 'deleteDraft' : 'cancelSession')}</summary>
            {editing.status === 'draft' ? (
              <button className="danger" disabled={busy} onClick={() => act(() => api.remove(editing.id))}>
                {t(lang, 'deleteDraft')}
              </button>
            ) : (
              <div className="cancel-form">
                <select value={cancelCode} onChange={(e) => setCancelCode(e.target.value as CancelReason)}>
                  <option value="">{t(lang, 'cancelReasonPick')}…</option>
                  {CANCEL_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(lang, cancelKey[r])}
                    </option>
                  ))}
                </select>
                <input
                  placeholder={t(lang, cancelCode === 'other' ? 'reasonDetailRequired' : 'reasonDetail')}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
                {cancelOpen && <CreditPanel lang={lang} sessionId={editing.id} people={people} preview onChange={onCredits} />}
                <button
                  className="danger"
                  disabled={busy || !canCancel}
                  onClick={() => act(() => api.cancel(editing.id, cancelCode as CancelReason, cancelReason.trim(), credits.choices))}
                >
                  {t(lang, 'cancelSession')}
                </button>
              </div>
            )}
          </details>
        )}
        {creditError && <p className="error-text">{t(lang, creditError === 'other_needs_text' ? 'otherNeedsText' : 'creditNote')}</p>}

        <footer>
          <button onClick={onClose}>{t(lang, 'close')}</button>
          <button className="primary" disabled={busy || !input || !placeOk || errors.length > 0} onClick={save}>
            {t(lang, needsConfirm ? 'saveAnyway' : editing ? 'saveChanges' : 'save')}
          </button>
        </footer>
      </div>
    </div>
  );
}
