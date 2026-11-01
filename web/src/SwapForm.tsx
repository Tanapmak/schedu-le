import { useState } from 'react';
import { api, type Person, type Room, type Session, type User } from './api';
import { t, type Lang, type ViolationLike } from './i18n';
import { Checks, Modal, sessionLabel } from './ui';

interface Props {
  lang: Lang;
  user: User;
  people: Person[];
  rooms: Room[];
  session: Session;
  /** Published sessions in the coming weeks, to pick the one to trade for. */
  upcoming: Session[];
  onClose: () => void;
  onSaved: () => void;
}

export function SwapForm({ lang, user, people, rooms, session, upcoming, onClose, onSaved }: Props) {
  const myRole = session.staff.find((s) => s.personId === user.id)?.role ?? 'mc';
  const [mode, setMode] = useState<'give' | 'trade'>('give');
  const [targetId, setTargetId] = useState(0);
  const [targetSessionId, setTargetSessionId] = useState(0);
  const [reason, setReason] = useState('');
  const [violations, setViolations] = useState<ViolationLike[]>([]);
  const [busy, setBusy] = useState(false);

  // Anyone who can take my role in this session (a PD can host; OP fills either seat).
  const canTake = myRole === 'mc' ? ['mc', 'pd', 'operation'] : ['pd', 'operation'];
  const inSession = new Set(session.staff.map((s) => s.personId));
  const candidates = people.filter((p) => p.isActive && p.id !== user.id && !inSession.has(p.id) && canTake.includes(p.position));
  const now = Date.now();
  const theirSessions = upcoming.filter(
    (s) =>
      s.id !== session.id &&
      s.status === 'published' &&
      new Date(s.start).getTime() > now &&
      s.staff.some((x) => x.personId === targetId && !x.replaced) &&
      !s.staff.some((x) => x.personId === user.id),
  );
  const valid = targetId > 0 && (mode === 'give' || targetSessionId > 0);

  async function submit() {
    setBusy(true);
    try {
      const out = await api.fileSwap({
        sessionId: session.id,
        targetId,
        targetSessionId: mode === 'trade' ? targetSessionId : null,
        reason: reason.trim() || undefined,
      });
      if (out.ok) return onSaved();
      setViolations(out.violations);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`${t(lang, 'requestSwap')} · ${sessionLabel(lang, session, rooms)}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>{t(lang, 'close')}</button>
          <button className="primary" disabled={busy || !valid} onClick={submit}>
            {t(lang, 'submit')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="wide segmented" role="group">
          {(['give', 'trade'] as const).map((m) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {t(lang, m === 'give' ? 'swapGive' : 'swapTrade')}
            </button>
          ))}
        </div>
        <label className="wide">
          {t(lang, 'swapTo')}
          <select
            value={targetId}
            onChange={(e) => {
              setTargetId(Number(e.target.value));
              setTargetSessionId(0);
              setViolations([]);
            }}
          >
            <option value={0}>{t(lang, 'choose')}</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname} ({p.position.toUpperCase()})
              </option>
            ))}
          </select>
        </label>
        {mode === 'trade' && targetId > 0 && (
          <label className="wide">
            {t(lang, 'theirSession')}
            {theirSessions.length === 0 ? (
              <span className="hint">{t(lang, 'noTheirSessions')}</span>
            ) : (
              <select value={targetSessionId} onChange={(e) => setTargetSessionId(Number(e.target.value))}>
                <option value={0}>{t(lang, 'choose')}</option>
                {theirSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sessionLabel(lang, s, rooms)}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}
        <label className="wide">
          {t(lang, 'reason')}
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <Checks lang={lang} violations={violations} people={people} rooms={rooms} />
    </Modal>
  );
}
