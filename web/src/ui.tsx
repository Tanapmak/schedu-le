import type { ReactNode } from 'react';
import type { Person, RequestStatus, Room, SessionRef } from './api';
import { t, violationMessage, type Lang, type StringKey, type ViolationLike } from './i18n';
import { bkkDate, bkkTime, formatDay } from './time';

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="icon" aria-label="close" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
        <footer>{footer}</footer>
      </div>
    </div>
  );
}

export function Checks({ lang, violations, people, rooms }: { lang: Lang; violations: ViolationLike[]; people: Person[]; rooms: Room[] }) {
  if (violations.length === 0) return null;
  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;
  const codeOf = (id: number) => rooms.find((r) => r.id === id)?.code ?? `#${id}`;
  return (
    <ul className="checks" aria-live="polite">
      {violations.map((v, i) => (
        <li key={i} className={v.severity}>
          {v.severity === 'error' ? '✕ ' : '! '}
          {violationMessage(lang, v, nameOf, codeOf)}
        </li>
      ))}
    </ul>
  );
}

const statusKey: Record<RequestStatus, StringKey> = {
  pending: 'statusPending',
  approved: 'statusApproved',
  rejected: 'statusRejected',
  withdrawn: 'statusWithdrawn',
};

export const StatusPill = ({ lang, status }: { lang: Lang; status: RequestStatus }) => (
  <span className={`pill status-${status}`}>{t(lang, statusKey[status])}</span>
);

/** "Mon 3 Nov 10:00–12:00", or "3 Nov – 5 Nov" for whole days. */
export function periodLabel(lang: Lang, start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const d = (x: Date) => formatDay(bkkDate(x), lang, { weekday: 'short', day: 'numeric', month: 'short' });
  const wholeDays = bkkTime(s) === '00:00' && bkkTime(e) === '00:00';
  if (wholeDays) {
    const last = new Date(e.getTime() - 1);
    return bkkDate(s) === bkkDate(last) ? d(s) : `${d(s)} – ${d(last)}`;
  }
  return `${d(s)} ${bkkTime(s)}–${bkkTime(e)}`;
}

export const sessionLabel = (lang: Lang, s: SessionRef, rooms: Room[]) =>
  `${rooms.find((r) => r.id === s.roomId)?.code ?? '#' + s.roomId} · ${periodLabel(lang, s.start, s.end)}`;

/** Outcome of a submit: saved, blocked (errors) or waiting for a confirm (warnings only). */
export function outcomeState(violations: ViolationLike[], ok: boolean): 'saved' | 'blocked' | 'confirm' {
  if (ok) return 'saved';
  return violations.some((v) => v.severity === 'error') ? 'blocked' : 'confirm';
}
