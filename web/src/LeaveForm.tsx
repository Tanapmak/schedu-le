import { useEffect, useState } from 'react';
import { api, LEAVE_REASONS, type Holiday, type LeaveReason, type Person, type Room, type Session, type User, isManager } from './api';
import { reasonKey } from './LeaveExtras';
import { t, type Lang, type ViolationLike } from './i18n';
import { addDays, bkkDate, bkkInstant, bkkTime, formatDay, liveInstant, todayBkk } from './time';
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
  const isAdmin = isManager(user.role);
  const [personId, setPersonId] = useState(user.id);
  const [kind, setKind] = useState<'normal' | 'urgent'>('normal');
  const [from, setFrom] = useState(addDays(todayBkk(), 1));
  const [to, setTo] = useState(addDays(todayBkk(), 1));
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');
  const [reason, setReason] = useState('');
  const [reasonCode, setReasonCode] = useState<LeaveReason | ''>('');
  // Urgent leave picks the sessions it covers; "whole day" falls back to dates.
  const [daySessions, setDaySessions] = useState<Session[]>();
  const [picked, setPicked] = useState<number[]>([]);
  const [wholeDay, setWholeDay] = useState(false);
  const bySession = kind === 'urgent' && !wholeDay;
  const [violations, setViolations] = useState<ViolationLike[]>([]);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Whole days are [from 00:00, day after `to` 00:00); a part day stays on one date.
  const start = allDay ? bkkInstant(from, '00:00') : bkkInstant(from, startTime);
  const end = allDay ? bkkInstant(addDays(to < from ? from : to, 1), '00:00') : bkkInstant(from, endTime);
  // Team off days: warn straight away, the team is off anyway.
  const [offDays, setOffDays] = useState<Holiday[]>([]);
  useEffect(() => {
    if (end <= start) return setOffDays([]);
    api.holidays(start, end).then(setOffDays, () => setOffDays([]));
  }, [start.getTime(), end.getTime()]);
  // The chosen person's published sessions on that live day (06:00 to 06:00).
  useEffect(() => {
    if (kind !== 'urgent') return;
    const dayStart = liveInstant(from, '06:00');
    setDaySessions(undefined);
    setPicked([]);
    api.board(dayStart, new Date(dayStart.getTime() + 86_400_000)).then(
      (b) =>
        setDaySessions(
          b.sessions.filter((x) => x.status === 'published' && Date.parse(x.start) >= dayStart.getTime() && x.staff.some((st) => st.personId === personId && !st.replaced)),
        ),
      () => setDaySessions([]),
    );
  }, [kind, from, personId]);
  const reasonOk = kind === 'normal' || (reasonCode !== '' && (reasonCode !== 'other' || reason.trim() !== ''));
  const periodOk = bySession ? picked.length > 0 : end > start && offDays.length === 0;
  const valid = reasonOk && periodOk;

  const reset = () => {
    setViolations([]);
    setNeedsConfirm(false);
  };

  async function submit() {
    setBusy(true);
    try {
      const out = await api.fileLeave(
        {
          start: start.toISOString(),
          end: end.toISOString(),
          kind,
          reason: reason.trim() || undefined,
          reasonCode: kind === 'urgent' && reasonCode ? reasonCode : undefined,
          sessionIds: bySession ? picked : undefined,
          personId: isAdmin ? personId : undefined,
        },
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
        {kind === 'urgent' && (
          <>
            <p className="hint wide">{t(lang, 'urgentHint')}</p>
            <label className="wide">
              {t(lang, 'reason')}
              <select value={reasonCode} onChange={(e) => (setReasonCode(e.target.value as LeaveReason), reset())}>
                <option value="">{t(lang, 'pickReason')}…</option>
                {LEAVE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(lang, reasonKey[r])}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint wide">{t(lang, 'urgentHoursHint')}</p>
          </>
        )}
        <label>
          {t(lang, 'fromDate')}
          <input type="date" value={from} onChange={(e) => (setFrom(e.target.value), reset())} />
        </label>
        {bySession ? (
          <div className="wide session-pick">
            <span>{t(lang, 'pickSessions')}</span>
            {daySessions === undefined && <p className="muted">{t(lang, 'loading')}</p>}
            {daySessions?.length === 0 && <p className="muted">{t(lang, 'noSessionsThatDay')}</p>}
            {daySessions?.map((x) => (
              <label key={x.id} className="inline">
                <input
                  type="checkbox"
                  checked={picked.includes(x.id)}
                  onChange={(e) => (setPicked((p) => (e.target.checked ? [...p, x.id] : p.filter((id) => id !== x.id))), reset())}
                />
                {rooms.find((r) => r.id === x.roomId)?.code} {bkkTime(new Date(x.start))}–{bkkTime(new Date(x.end))}
              </label>
            ))}
          </div>
        ) : allDay ? (
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
        {kind === 'urgent' ? (
          <label className="inline wide">
            <input type="checkbox" checked={wholeDay} onChange={(e) => (setWholeDay(e.target.checked), setAllDay(true), reset())} />
            {t(lang, 'wholeDayInstead')}
          </label>
        ) : (
          <label className="inline wide">
            <input type="checkbox" checked={allDay} onChange={(e) => (setAllDay(e.target.checked), reset())} />
            {t(lang, 'allDay')}
          </label>
        )}
        <label className="wide">
          {kind === 'urgent' ? t(lang, reasonCode === 'other' ? 'reasonDetailRequired' : 'reasonDetail') : t(lang, 'reason')}
          <input value={reason} onChange={(e) => (setReason(e.target.value), reset())} />
        </label>
      </div>
      {offDays.length > 0 && (
        <ul className="checks">
          {offDays.map((h) => (
            <li key={h.id} className="error">
              ✕{' '}
              {t(lang, 'offDayLeaveWarn')
                .replace('{date}', formatDay(bkkDate(new Date(h.start)), lang, { weekday: 'short', day: 'numeric', month: 'short' }))
                .replace('{name}', h.name)}
            </li>
          ))}
        </ul>
      )}
      <Checks lang={lang} violations={violations} people={people} rooms={rooms} />
    </Modal>
  );
}
