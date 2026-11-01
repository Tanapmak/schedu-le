import { useEffect, useState, type ReactNode } from 'react';
import { api, type Board, type LeaveRequest, type Person, type Room, type Session, type SwapRequest } from './api';
import { t, type Lang, type ViolationLike } from './i18n';
import { addDays, bkkDate, bkkInstant, bkkTime, formatDay } from './time';
import { Checks, Modal, periodLabel } from './ui';

type Staff = Session['staff'];
export type PreviewItem = { type: 'leave'; item: LeaveRequest } | { type: 'swap'; item: SwapRequest };

/** Staff of a session after the swap: the requester's place goes to the target, and back for a trade. */
function swapStaff(staff: Staff, from: number, to: number): Staff {
  return staff.map((x) => (x.personId === from && !x.replaced ? { ...x, personId: to } : x));
}

/**
 * Before / after of a request, so the admin sees who moves where before approving.
 * Swaps run the schedule rules on the "after" sessions; leave lists the sessions that lose someone.
 */
export function RequestPreview({
  lang,
  row,
  people,
  rooms,
  onClose,
  actions,
}: {
  lang: Lang;
  row: PreviewItem;
  people: Person[];
  rooms: Room[];
  onClose: () => void;
  actions: ReactNode;
}) {
  const [board, setBoard] = useState<Board>();
  const [checks, setChecks] = useState<ViolationLike[]>();
  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;
  const codeOf = (id: number) => rooms.find((r) => r.id === id)?.code ?? `#${id}`;

  // The days involved, with a little margin, so we have the sessions' current staff.
  const spans =
    row.type === 'swap'
      ? [row.item.session, ...(row.item.targetSession ? [row.item.targetSession] : [])]
      : [{ start: row.item.start, end: row.item.end }];
  const from = new Date(Math.min(...spans.map((s) => Date.parse(s.start))) - 86_400_000);
  const to = new Date(Math.max(...spans.map((s) => Date.parse(s.end))) + 86_400_000);
  const tooLong = to.getTime() - from.getTime() > 60 * 86_400_000;

  useEffect(() => {
    if (tooLong) return;
    void api.board(from, to).then(setBoard);
  }, [from.getTime(), to.getTime()]);

  const find = (id?: number) => board?.sessions.find((s) => s.id === id);

  // Swap: before and after for each session that changes.
  const pairs: { before: Session; after: Session }[] = [];
  if (board && row.type === 'swap') {
    const { requesterId: a, targetId: b } = row.item;
    const mine = find(row.item.session.id);
    const theirs = find(row.item.targetSession?.id);
    if (mine) pairs.push({ before: mine, after: { ...mine, staff: swapStaff(mine.staff, a, b) } });
    if (theirs) pairs.push({ before: theirs, after: { ...theirs, staff: swapStaff(theirs.staff, b, a) } });
  }

  useEffect(() => {
    if (row.type !== 'swap' || row.item.status !== 'pending' || pairs.length === 0) return;
    void Promise.all(
      pairs.map((p) => api.check({ id: p.after.id, roomId: p.after.roomId, start: p.after.start, end: p.after.end, note: p.after.note, staff: p.after.staff })),
    ).then((all) => {
      const seen = new Set<string>();
      setChecks(all.flat().filter((v) => (seen.has(JSON.stringify(v)) ? false : (seen.add(JSON.stringify(v)), true))));
    }, () => setChecks([]));
  }, [board]);

  // Leave: the person's sessions inside the leave, and who else is off those days.
  const leaveSessions =
    board && row.type === 'leave'
      ? board.sessions.filter(
          (s) =>
            s.status !== 'cancelled' &&
            s.staff.some((x) => x.personId === row.item.personId && !x.replaced) &&
            Date.parse(s.start) < Date.parse(row.item.end) &&
            Date.parse(s.end) > Date.parse(row.item.start),
        )
      : [];
  const leaveDays: string[] = [];
  if (row.type === 'leave') {
    const last = bkkDate(new Date(Date.parse(row.item.end) - 1));
    for (let d = bkkDate(new Date(row.item.start)); d <= last && leaveDays.length < 31; d = addDays(d, 1)) leaveDays.push(d);
  }
  const position = row.type === 'leave' ? people.find((p) => p.id === row.item.personId)?.position : undefined;
  const othersOff = (day: string) =>
    (board?.leaves ?? []).filter(
      (l) =>
        row.type === 'leave' &&
        l.personId !== row.item.personId &&
        people.find((p) => p.id === l.personId)?.position === position &&
        Date.parse(l.start) < bkkInstant(addDays(day, 1), '00:00').getTime() &&
        Date.parse(l.end) > bkkInstant(day, '00:00').getTime(),
    );

  const decided = row.item.status !== 'pending';
  const title =
    row.type === 'swap'
      ? `${t(lang, 'swapLabel')} · ${nameOf(row.item.requesterId)} ⇄ ${nameOf(row.item.targetId)}`
      : `${t(lang, row.item.kind === 'urgent' ? 'leaveUrgent' : 'leaveNormal')} · ${nameOf(row.item.personId)}`;
  const highlight = row.type === 'swap' ? new Set([row.item.requesterId, row.item.targetId]) : new Set([row.item.personId]);

  return (
    <Modal title={title} onClose={onClose} footer={actions} wide>
      {row.item.reason && <p className="request-reason">“{row.item.reason}”</p>}
      {decided && <p className="hint">{t(lang, 'previewDecided')}</p>}
      {tooLong && <p className="muted">{periodLabel(lang, spans[0].start, spans[0].end)}</p>}
      {!board && !tooLong && <p className="muted">{t(lang, 'loading')}</p>}

      {row.type === 'swap' && board && (
        <>
          {pairs.length === 0 && <p className="muted">{t(lang, 'previewMissing')}</p>}
          {pairs.map((p) => (
            <div key={p.before.id} className="pv-pair">
              <div className="pv-when">
                <strong>{codeOf(p.before.roomId)}</strong>
                <span>{formatDay(bkkDate(new Date(p.before.start)), lang, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span>
                  {bkkTime(new Date(p.before.start))}–{bkkTime(new Date(p.before.end))}
                </span>
              </div>
              <SessionBox lang={lang} label={t(lang, decided ? 'previewNow' : 'previewBefore')} staff={p.before.staff} nameOf={nameOf} highlight={highlight} tone="before" />
              {!decided && (
                <>
                  <span className="pv-arrow" aria-hidden="true">→</span>
                  <SessionBox lang={lang} label={t(lang, 'previewAfter')} staff={p.after.staff} nameOf={nameOf} highlight={highlight} tone="after" />
                </>
              )}
            </div>
          ))}
          {!decided && pairs.length > 0 && (
            <div className="pv-checks">
              <h3>{t(lang, 'previewRules')}</h3>
              {checks === undefined ? (
                <p className="muted">{t(lang, 'loading')}</p>
              ) : checks.length === 0 ? (
                <p className="ok-text">✓ {t(lang, 'previewRulesOk')}</p>
              ) : (
                <Checks lang={lang} violations={checks} people={people} rooms={rooms} />
              )}
            </div>
          )}
        </>
      )}

      {row.type === 'leave' && board && (
        <>
          <h3>{t(lang, 'previewLeaveDays')}</h3>
          <div className="pv-days">
            {leaveDays.map((d) => {
              const others = othersOff(d);
              const full = others.length + 1 > 2;
              return (
                <div key={d} className={`pv-day${full ? ' full' : ''}`}>
                  <strong>{formatDay(d, lang, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
                  <small>
                    {(position ?? '').toUpperCase()} {t(lang, 'onLeave')} {others.length + 1}/2
                  </small>
                  {others.length > 0 && <small className="muted">{others.map((l) => nameOf(l.personId)).join(', ')}</small>}
                </div>
              );
            })}
          </div>
          <h3>{t(lang, 'previewAffected')}</h3>
          {leaveSessions.length === 0 ? (
            <p className="ok-text">✓ {t(lang, 'previewNoSessions')}</p>
          ) : (
            leaveSessions.map((s) => (
              <div key={s.id} className="pv-pair">
                <div className="pv-when">
                  <strong>{codeOf(s.roomId)}</strong>
                  <span>{formatDay(bkkDate(new Date(s.start)), lang, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span>
                    {bkkTime(new Date(s.start))}–{bkkTime(new Date(s.end))}
                  </span>
                </div>
                <SessionBox lang={lang} label={t(lang, decided ? 'previewNow' : 'previewBefore')} staff={s.staff} nameOf={nameOf} highlight={highlight} tone="before" />
                {!decided && (
                  <>
                    <span className="pv-arrow" aria-hidden="true">→</span>
                    <SessionBox
                      lang={lang}
                      label={t(lang, 'previewAfter')}
                      staff={s.staff}
                      nameOf={nameOf}
                      highlight={highlight}
                      tone="after"
                      vacant={row.item.personId}
                    />
                  </>
                )}
              </div>
            ))
          )}
        </>
      )}
    </Modal>
  );
}

function SessionBox({
  lang,
  label,
  staff,
  nameOf,
  highlight,
  tone,
  vacant,
}: {
  lang: Lang;
  label: string;
  staff: Staff;
  nameOf: (id: number) => string;
  highlight: Set<number>;
  tone: 'before' | 'after';
  vacant?: number;
}) {
  const working = staff.filter((x) => !x.replaced);
  return (
    <div className={`pv-box ${tone}`}>
      <small>{label}</small>
      {(['mc', 'pd'] as const).map((role) => {
        const people = working.filter((x) => x.role === role);
        return (
          <div key={role} className="pv-role">
            <span className={`role role-${role}`}>{t(lang, role)}</span>
            {people.length === 0 && <span className="muted">—</span>}
            {people.map((x) =>
              x.personId === vacant ? (
                <span key={x.personId} className="pv-name vacant">
                  {t(lang, 'previewVacant')}
                </span>
              ) : (
                <span key={x.personId} className={`pv-name${highlight.has(x.personId) ? ' hl' : ''}`}>
                  {nameOf(x.personId)}
                </span>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}
