import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type LeaveRequest, type Outcome, type Person, type Room, type SwapRequest, type User, isManager } from './api';
import { t, type Lang, type ViolationLike } from './i18n';
import { bkkDate, bkkTime, formatDay } from './time';
import { RequestPreview } from './RequestPreview';
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
  /** Lay the requests out as a grid of cards. */
  cards?: boolean;
  /** Lay the requests out as a table (admin's leave page). */
  table?: boolean;
  onChanged: () => void;
}

type Row = { type: 'leave'; at: string; item: LeaveRequest } | { type: 'swap'; at: string; item: SwapRequest };

/** Leave and swap requests in one list, newest first, with the actions the viewer may take. */
export function RequestList({ lang, user, people, rooms, leave, swaps, decide, cards, table, onChanged }: Props) {
  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;
  const rows: Row[] = [
    ...leave.map((item): Row => ({ type: 'leave', at: item.createdAt, item })),
    ...swaps.map((item): Row => ({ type: 'swap', at: item.createdAt, item })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  if (rows.length === 0) return <p className="muted">{t(lang, decide ? 'nothingPending' : 'noRequests')}</p>;

  if (table)
    return (
      <div className="table-wrap table-cards">
        <table className="data requests">
          <thead>
            <tr>
              <th>{t(lang, 'name')}</th>
              <th>{t(lang, 'position')}</th>
              <th>{t(lang, 'date')}</th>
              <th>{t(lang, 'typeCol')}</th>
              <th>{t(lang, 'reason')}</th>
              <th>{t(lang, 'filedAt')}</th>
              <th>{t(lang, 'status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <RequestRow key={`${r.type}${r.item.id}`} row={r} asRow {...{ lang, user, people, rooms, decide, onChanged, nameOf }} />
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <ul className={`request-list${cards ? ' cards' : ''}`}>
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
  asRow,
}: Omit<Props, 'leave' | 'swaps' | 'cards' | 'table'> & { row: Row; nameOf: (id: number) => string; asRow?: boolean }) {
  const [violations, setViolations] = useState<ViolationLike[]>([]);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
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

  let who: string;
  let what: string;
  let kindLabel: string;
  let name: string;
  let position: string;
  if (row.type === 'leave') {
    const l = row.item;
    const pos = people.find((p) => p.id === l.personId)?.position;
    who = `${nameOf(l.personId)}${pos === 'mc' || pos === 'pd' ? ` · ${pos.toUpperCase()}` : ''}`;
    name = nameOf(l.personId);
    position = pos === 'mc' || pos === 'pd' ? pos.toUpperCase() : pos === 'operation' ? 'OP' : '';
    what = periodLabel(lang, l.start, l.end);
    kindLabel = t(lang, l.kind === 'urgent' ? 'leaveUrgent' : 'leaveNormal');
  } else {
    const s = row.item;
    const values = {
      from: nameOf(s.requesterId),
      to: nameOf(s.targetId),
      mine: sessionLabel(lang, s.session, rooms),
      theirs: s.targetSession ? sessionLabel(lang, s.targetSession, rooms) : '',
    };
    who = `${values.from} → ${values.to}`;
    name = who;
    const rp = people.find((p) => p.id === s.requesterId)?.position;
    position = rp === 'mc' || rp === 'pd' ? rp.toUpperCase() : '';
    what = t(lang, s.targetSession ? 'swapTradeText' : 'swapGiveText').replace(/\{(\w+)\}/g, (_, k: keyof typeof values) => values[k]);
    kindLabel = t(lang, 'swapLabel');
  }

  const urgent = row.type === 'leave' && row.item.kind === 'urgent';
  const actions = pending && (
    <div className="request-actions">
      {decide && isManager(user.role) && (
        <>
          <button disabled={busy} onClick={() => run(decideCall('reject'))}>
            {t(lang, 'reject')}
          </button>
          <button className="primary" disabled={busy} onClick={() => run(decideCall('approve'))}>
            {t(lang, needsConfirm ? 'approveAnyway' : 'approve')}
          </button>
        </>
      )}
      {ownerId === user.id && (
        <button className="link" disabled={busy} onClick={() => run(withdrawCall)}>
          {t(lang, 'withdraw')}
        </button>
      )}
    </div>
  );

  if (asRow)
    return (
      <>
        <tr className={`clickable${urgent ? ' urgent' : ''}`} onClick={(e) => !(e.target as HTMLElement).closest('button') && setPreviewing(true)}>
          <td data-label={t(lang, 'name')}>
            <strong>{name}</strong>
          </td>
          <td data-label={t(lang, 'position')}>{position}</td>
          <td data-label={t(lang, 'date')} className="wrap">{what}</td>
          <td data-label={t(lang, 'typeCol')}>
            <span className={urgent ? 'urgent-text' : ''}>{kindLabel}</span>
          </td>
          <td data-label={t(lang, 'reason')} className="wrap muted">{item.reason ?? '—'}</td>
          <td data-label={t(lang, 'filedAt')} className="muted">{formatDay(bkkDate(new Date(item.createdAt)), lang, { day: 'numeric', month: 'short' })} {bkkTime(new Date(item.createdAt))}</td>
          <td data-label={t(lang, 'status')}>
            <StatusPill lang={lang} status={item.status} />
          </td>
          <td>
            <div className="request-actions">
              <button className="link" onClick={() => setPreviewing(true)}>
                {t(lang, 'viewDetails')}
              </button>
              {actions}
            </div>
          </td>
        </tr>
        {previewing &&
          createPortal(
              <RequestPreview
                lang={lang}
                row={row.type === 'leave' ? { type: 'leave', item: row.item } : { type: 'swap', item: row.item }}
                people={people}
                rooms={rooms}
                onClose={() => setPreviewing(false)}
                actions={
                  <>
                    <Checks lang={lang} violations={violations} people={people} rooms={rooms} />
                    {actions || <button onClick={() => setPreviewing(false)}>{t(lang, 'close')}</button>}
                  </>
                }
              />,
            document.body,
          )}
        {violations.length > 0 && (
          <tr className="checks-row">
            <td colSpan={8}>
              <Checks lang={lang} violations={violations} people={people} rooms={rooms} />
            </td>
          </tr>
        )}
      </>
    );

  return (
    <li className={urgent ? 'urgent' : ''}>
      <div className="request-main">
        <span className={`tag${row.type === 'leave' && row.item.kind === 'urgent' ? ' tag-urgent' : ''}`}>{kindLabel}</span>
        <StatusPill lang={lang} status={item.status} />
      </div>
      <strong className="request-who">{who}</strong>
      <span className="request-title">{what}</span>
      {item.reason && <p className="request-reason">{item.reason}</p>}
      {pending && (
        <div className="request-actions">
          {decide && isManager(user.role) && (
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
