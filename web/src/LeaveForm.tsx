import { useState } from 'react';
import { api, type Person, type Room, type User } from './api';
import { t, type Lang, type ViolationLike } from './i18n';
import { addDays, bkkInstant, todayBkk } from './time';
import { Checks, Modal, outcomeState } from './ui';

interface Props {
  lang: Lang;
  user: User;
  people: Person[];
  rooms: Room[];
  onClose: () => void;
  onSaved: () => void;
}

export function LeaveForm({ lang, user, people, rooms, onClose, onSaved }: Props) {
  const isAdmin = user.role === 'admin';
  const [personId, setPersonId] = useState(user.id);
  const [kind, setKind] = useState<'normal' | 'urgent'>('normal');
  const [from, setFrom] = useState(addDays(todayBkk(), 1));
  const [to, setTo] = useState(addDays(todayBkk(), 1));
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');
  const [reason, setReason] = useState('');
  const [violations, setViolations] = useState<ViolationLike[]>([]);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Whole days are [from 00:00, day after `to` 00:00); a part day stays on one date.
  const start = allDay ? bkkInstant(from, '00:00') : bkkInstant(from, startTime);
  const end = allDay ? bkkInstant(addDays(to < from ? from : to, 1), '00:00') : bkkInstant(from, endTime);
  const valid = end > start && (kind === 'normal' || reason.trim() !== '');

  const reset = () => {
    setViolations([]);
    setNeedsConfirm(false);
  };

  async function submit() {
    setBusy(true);
    try {
      const out = await api.fileLeave(
        { start: start.toISOString(), end: end.toISOString(), kind, reason: reason.trim() || undefined, personId: isAdmin ? personId : undefined },
        needsConfirm,
      );
      const state = outcomeState(out.violations, out.ok);
      if (state === 'saved') return onSaved();
      setViolations(out.violations);
      setNeedsConfirm(state === 'confirm');
    } finally {
      setBusy(false);
    }
  }

  const staff = people.filter((p) => p.isActive);

  return (
    <Modal
      title={t(lang, 'requestLeave')}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>{t(lang, 'close')}</button>
          <button className="primary" disabled={busy || !valid} onClick={submit}>
            {t(lang, needsConfirm ? 'submitAnyway' : 'submit')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {isAdmin && (
          <label className="wide">
            {t(lang, 'fileFor')}
            <select value={personId} onChange={(e) => (setPersonId(Number(e.target.value)), reset())}>
              {staff.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === user.id ? `${p.nickname} (${t(lang, 'me')})` : p.nickname}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="wide segmented" role="group" aria-label={t(lang, 'leaveKind')}>
          {(['normal', 'urgent'] as const).map((k) => (
            <button key={k} className={kind === k ? 'active' : ''} onClick={() => (setKind(k), reset())}>
              {t(lang, k === 'normal' ? 'leaveNormal' : 'leaveUrgent')}
            </button>
          ))}
        </div>
        {kind === 'urgent' && <p className="hint wide">{t(lang, 'urgentHint')}</p>}
        <label>
          {t(lang, 'fromDate')}
          <input type="date" value={from} onChange={(e) => (setFrom(e.target.value), reset())} />
        </label>
        {allDay ? (
          <label>
            {t(lang, 'toDate')}
            <input type="date" value={to} min={from} onChange={(e) => (setTo(e.target.value), reset())} />
          </label>
        ) : (
          <div className="time-pair">
            <label>
              {t(lang, 'startTime')}
              <input type="time" step={1800} value={startTime} onChange={(e) => (setStartTime(e.target.value), reset())} />
            </label>
            <label>
              {t(lang, 'endTime')}
              <input type="time" step={1800} value={endTime} onChange={(e) => (setEndTime(e.target.value), reset())} />
            </label>
          </div>
        )}
        <label className="inline wide">
          <input type="checkbox" checked={allDay} onChange={(e) => (setAllDay(e.target.checked), reset())} />
          {t(lang, 'allDay')}
        </label>
        <label className="wide">
          {t(lang, 'reason')}
          <input value={reason} onChange={(e) => (setReason(e.target.value), reset())} />
        </label>
      </div>
      <Checks lang={lang} violations={violations} people={people} rooms={rooms} />
    </Modal>
  );
}
