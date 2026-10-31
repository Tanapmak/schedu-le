import { useState } from 'react';
import { api, type LeaveRequest, type Outcome, type Person, type Room, type SwapRequest, type User } from './api';
import { t, type Lang, type ViolationLike } from './i18n';
import { Checks, periodLabel, sessionLabel, StatusPill } from './ui';

interface Props {
  lang: Lang;
  user: User;
  people: Person[];
  rooms: Room[];
  leave: LeaveRequest[];
  swaps: SwapRequest[];
  /** Show approve/reject on pending rows (admin queue). */
  decide?: boolean;
  onChanged: () => void;
}

type Row = { type: 'leave'; at: string; item: LeaveRequest } | { type: 'swap'; at: string; item: SwapRequest };

/** Leave and swap requests in one list, newest first, with the actions the viewer may take. */
export function RequestList({ lang, user, people, rooms, leave, swaps, decide, onChanged }: Props) {
  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;
  const rows: Row[] = [
    ...leave.map((item): Row => ({ type: 'leave', at: item.createdAt, item })),
    ...swaps.map((item): Row => ({ type: 'swap', at: item.createdAt, item })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  if (rows.length === 0) return <p className="muted">{t(lang, decide ? 'nothingPending' : 'noRequests')}</p>;

  return (
    <ul className="request-list">
      {rows.map((r) => (
        <RequestRow key={`${r.type}${r.item.id}`} row={r} {...{ lang, user, people, rooms, decide, onChanged, nameOf }} />
      ))}
    </ul>
  );
}

function RequestRow({
  row,
  lang,
  user,
  people,
  rooms,
  decide,
  onChanged,
  nameOf,
}: Omit<Props, 'leave' | 'swaps'> & { row: Row; nameOf: (id: number) => string }) {
  const [violations, setViolations] = useState<ViolationLike[]>([]);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const { item } = row;
  const ownerId = row.type === 'leave' ? row.item.personId : row.item.requesterId;
  const pending = item.status === 'pending';

  async function run(call: () => Promise<Outcome | { ok: boolean }>) {
    setBusy(true);
    try {
      const out = await call();
      if (out.ok) return onChanged();
      const v = 'violations' in out ? out.violations : [];
      setViolations(v);
      setNeedsConfirm(v.length > 0 && v.every((x) => x.severity === 'warning'));
    } finally {
      setBusy(false);
    }
  }

  const decideCall = (d: 'approve' | 'reject') => () =>
    row.type === 'leave' ? api.decideLeave(item.id, d, needsConfirm) : api.decideSwap(item.id, d, needsConfirm);
  const withdrawCall = () => (row.type === 'leave' ? api.withdrawLeave(item.id) : api.withdrawSwap(item.id));

  let title: string;
  if (row.type === 'leave') {
    const l = row.item;
    title = `${nameOf(l.personId)} · ${t(lang, l.kind === 'urgent' ? 'leaveUrgent' : 'leaveNormal')} · ${periodLabel(lang, l.start, l.end)}`;
  } else {
    const s = row.item;
    const values = {
      from: nameOf(s.requesterId),
      to: nameOf(s.targetId),
      mine: sessionLabel(lang, s.session, rooms),
      theirs: s.targetSession ? sessionLabel(lang, s.targetSession, rooms) : '',
    };
    title = t(lang, s.targetSession ? 'swapTradeText' : 'swapGiveText').replace(/\{(\w+)\}/g, (_, k: keyof typeof values) => values[k]);
  }

  return (
    <li className={row.type === 'leave' && row.item.kind === 'urgent' ? 'urgent' : ''}>
      <div className="request-main">
        <span className="tag">{t(lang, row.type === 'leave' ? 'leave' : 'swapLabel')}</span>
        <span className="request-title">{title}</span>
        <StatusPill lang={lang} status={item.status} />
      </div>
      {item.reason && <p className="request-reason">{item.reason}</p>}
      {pending && (
        <div className="request-actions">
          {decide && user.role === 'admin' && (
            <>
              <button className="primary" disabled={busy} onClick={() => run(decideCall('approve'))}>
                {t(lang, needsConfirm ? 'approveAnyway' : 'approve')}
              </button>
              <button disabled={busy} onClick={() => run(decideCall('reject'))}>
                {t(lang, 'reject')}
              </button>
            </>
          )}
          {ownerId === user.id && (
            <button className="link" disabled={busy} onClick={() => run(withdrawCall)}>
              {t(lang, 'withdraw')}
            </button>
          )}
        </div>
      )}
      <Checks lang={lang} violations={violations} people={people} rooms={rooms} />
    </li>
  );
}
