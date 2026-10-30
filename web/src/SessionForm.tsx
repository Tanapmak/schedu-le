import { useEffect, useMemo, useState } from 'react';
import { api, type Person, type Room, type Session, type SessionInput } from './api';
import { t, violationMessage, type Lang, type ViolationLike } from './i18n';
import { bkkDate, bkkInstant, bkkTime } from './time';

export type FormTarget =
  | { mode: 'new'; roomId?: number; date: string; start: string; end: string }
  | { mode: 'edit'; session: Session };

interface Props {
  lang: Lang;
  rooms: Room[];
  people: Person[];
  target: FormTarget;
  onClose: () => void;
  onSaved: () => void;
}

export function SessionForm({ lang, rooms, people, target, onClose, onSaved }: Props) {
  const editing = target.mode === 'edit' ? target.session : undefined;
  const firstStaff = (role: 'mc' | 'pd') => editing?.staff.find((s) => s.role === role && !s.replaced)?.personId ?? 0;

  const [roomId, setRoomId] = useState(editing?.roomId ?? (target.mode === 'new' ? target.roomId : undefined) ?? 0);
  const [date, setDate] = useState(editing ? bkkDate(new Date(editing.start)) : target.mode === 'new' ? target.date : '');
  const [start, setStart] = useState(editing ? bkkTime(new Date(editing.start)) : target.mode === 'new' ? target.start : '10:00');
  const [end, setEnd] = useState(editing ? bkkTime(new Date(editing.end)) : target.mode === 'new' ? target.end : '12:00');
  const [mc, setMc] = useState(firstStaff('mc'));
  const [pd, setPd] = useState(firstStaff('pd'));
  const [note, setNote] = useState(editing?.note ?? '');
  const [violations, setViolations] = useState<ViolationLike[]>([]);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [countHours, setCountHours] = useState(true);

  const room = rooms.find((r) => r.id === roomId);
  const needsPd = room ? room.roomType === 'live' && room.requiresPd : true;
  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;
  const active = people.filter((p) => p.isActive);
  const mcOptions = active.filter((p) => p.position === 'mc' || p.position === 'pd'); // a PD can host
  const pdOptions = active.filter((p) => p.position === 'pd');

  const input = useMemo((): SessionInput | undefined => {
    if (!roomId || !date || !start || !end) return undefined;
    const s = bkkInstant(date, start);
    let e = bkkInstant(date, end);
    if (e <= s) e = new Date(e.getTime() + 86_400_000); // ends after midnight
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
      const res = await api.save(input, { id: editing?.id, confirm: needsConfirm });
      if (res.ok) return onSaved();
      setViolations(res.violations);
      setNeedsConfirm(res.violations.every((v) => v.severity === 'warning'));
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<{ ok: boolean }>) {
    setBusy(true);
    try {
      if ((await fn()).ok) onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
          <label>
            {t(lang, 'mc')}
            <select value={mc} onChange={(e) => setMc(Number(e.target.value))}>
              <option value={0}>{t(lang, 'choose')}</option>
              {mcOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname}
                  {p.position === 'pd' ? ' (PD)' : ''}
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
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="hint">{t(lang, 'contentNoPd')}</p>
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
              {violationMessage(lang, v, nameOf)}
            </li>
          ))}
        </ul>

        {editing && editing.status !== 'cancelled' && (
          <details className="danger-zone">
            <summary>{t(lang, editing.status === 'draft' ? 'deleteDraft' : 'cancelSession')}</summary>
            {editing.status === 'draft' ? (
              <button className="danger" disabled={busy} onClick={() => act(() => api.remove(editing.id))}>
                {t(lang, 'deleteDraft')}
              </button>
            ) : (
              <div className="cancel-form">
                <input
                  placeholder={t(lang, 'cancelReason')}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
                <label className="inline">
                  <input type="checkbox" checked={countHours} onChange={(e) => setCountHours(e.target.checked)} />
                  {t(lang, 'countHours')}
                </label>
                <button
                  className="danger"
                  disabled={busy || !cancelReason.trim()}
                  onClick={() => act(() => api.cancel(editing.id, cancelReason.trim(), countHours))}
                >
                  {t(lang, 'cancelSession')}
                </button>
              </div>
            )}
          </details>
        )}

        <footer>
          <button onClick={onClose}>{t(lang, 'close')}</button>
          <button className="primary" disabled={busy || !input || errors.length > 0} onClick={save}>
            {t(lang, needsConfirm ? 'saveAnyway' : editing ? 'saveChanges' : 'save')}
          </button>
        </footer>
      </div>
    </div>
  );
}
